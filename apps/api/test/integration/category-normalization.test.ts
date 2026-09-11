import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { buildTestApp, resetDatabase, signUp, type CapturingOtpSender, type SignedUpUser } from "./setup";

// The frontend already constrains category input to a fixed list (+ a free-text "Outro"
// fallback) — this suite verifies the server-side safety net that applies regardless of
// what any client sends: sanitization (whitespace/control chars) and case-insensitive
// reuse of an existing category within the same network, so "Cabelos" and "cabelos "
// never end up as two different stored values. See CatalogService.resolveCategory().
describe("category sanitization and normalization (backend)", () => {
  let app: FastifyInstance;
  let dataSource: DataSource;
  let otpSender: CapturingOtpSender;

  beforeAll(async () => {
    ({ app, dataSource, otpSender } = await buildTestApp());
  });

  afterEach(async () => {
    await resetDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
    await dataSource.destroy();
  });

  async function setupOwnerWithNetwork(email: string) {
    const owner = await signUp(app, otpSender, email, "Owner");
    const networkRes = await app.inject({
      method: "POST",
      url: "/networks",
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Network" }
    });
    const networkId = (networkRes.json() as { network: { id: string } }).network.id;
    return { owner, networkId };
  }

  function createProduct(owner: SignedUpUser, networkId: string, name: string, category: string) {
    return app.inject({
      method: "POST",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name, category }
    });
  }

  it("reuses an existing category's exact casing when a differently-cased/spaced value is sent", async () => {
    const { owner, networkId } = await setupOwnerWithNetwork("user11900000090@test.local");

    const first = await createProduct(owner, networkId, "Produto A", "Perfumaria");
    expect((first.json() as { product: { category: string } }).product.category).toBe("Perfumaria");

    const second = await createProduct(owner, networkId, "Produto B", "  perfumaria  ");
    expect((second.json() as { product: { category: string } }).product.category).toBe("Perfumaria");

    const third = await createProduct(owner, networkId, "Produto C", "PERFUMARIA");
    expect((third.json() as { product: { category: string } }).product.category).toBe("Perfumaria");
  });

  it("collapses internal whitespace and trims on first use of a category", async () => {
    const { owner, networkId } = await setupOwnerWithNetwork("user11900000091@test.local");

    const res = await createProduct(owner, networkId, "Produto A", "  Cuidados   com   a pele  ");
    expect((res.json() as { product: { category: string } }).product.category).toBe("Cuidados com a pele");
  });

  it("treats an empty or whitespace-only category as no category", async () => {
    const { owner, networkId } = await setupOwnerWithNetwork("user11900000092@test.local");

    const res = await createProduct(owner, networkId, "Produto A", "   ");
    expect((res.json() as { product: { category: string | null } }).product.category).toBeNull();
  });

  it("does not let category reuse leak across networks", async () => {
    const { owner: ownerA, networkId: networkA } = await setupOwnerWithNetwork("user11900000093@test.local");
    const { owner: ownerB, networkId: networkB } = await setupOwnerWithNetwork("user11900000094@test.local");

    await createProduct(ownerA, networkA, "Produto A", "Cabelos");
    const res = await createProduct(ownerB, networkB, "Produto B", "cabelos");

    // Different network, no existing "Cabelos" there yet — this is the first occurrence
    // in networkB, so it's stored as sanitized-but-as-typed, not coerced to networkA's casing.
    expect((res.json() as { product: { category: string } }).product.category).toBe("cabelos");
  });

  it("applies the same normalization on update as on create", async () => {
    const { owner, networkId } = await setupOwnerWithNetwork("user11900000095@test.local");

    await createProduct(owner, networkId, "Produto A", "Maquiagem");
    const createRes = await createProduct(owner, networkId, "Produto B", "Corpo e banho");
    const productId = (createRes.json() as { product: { id: string } }).product.id;

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/networks/${networkId}/products/${productId}`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { category: "  MAQUIAGEM  " }
    });
    expect((updateRes.json() as { product: { category: string } }).product.category).toBe("Maquiagem");
  });
});
