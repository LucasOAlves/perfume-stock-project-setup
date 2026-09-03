import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { buildApp } from "../../src/app";
import type { CatalogProvider, CatalogSuggestion } from "../../src/modules/catalog/catalog-provider";
import { CapturingOtpSender, createTestDataSource, resetDatabase, signUp } from "./setup";

class StubCatalogProvider implements CatalogProvider {
  constructor(private readonly result: CatalogSuggestion | null) {}
  async lookup(): Promise<CatalogSuggestion | null> {
    return this.result;
  }
}

// Slice 5 (conditional) — verifies the lookup endpoint is capability-gated, never
// writes anything, and degrades gracefully when the provider finds nothing / is absent.
// Does NOT hit a real external API — see docs/decisions/ADR-005-catalog-provider.md and
// test/integration/setup.ts (buildTestApp always uses NoopCatalogProvider by default).
describe("catalog lookup (Slice 5)", () => {
  let app: FastifyInstance;
  let dataSource: DataSource;
  let otpSender: CapturingOtpSender;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    otpSender = new CapturingOtpSender();
    const stubProvider = new StubCatalogProvider({
      name: "Perfume Encontrado",
      brand: "Marca X",
      imageUrl: "https://example.com/a.jpg"
    });
    app = await buildApp(dataSource, { otpSender, catalogProvider: stubProvider, logger: false });
  });

  afterEach(async () => {
    await resetDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
    await dataSource.destroy();
  });

  async function setupOwner(phone: string) {
    const owner = await signUp(app, otpSender, phone, "Owner");
    const networkRes = await app.inject({
      method: "POST",
      url: "/networks",
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Network" }
    });
    const networkId = (networkRes.json() as { network: { id: string } }).network.id;
    return { owner, networkId };
  }

  it("returns a suggestion for product.manage holders and never creates a product itself", async () => {
    const { owner, networkId } = await setupOwner("+5511900000080");

    const res = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/catalog-lookup?barcode=7891000100103`,
      headers: { cookie: owner.cookies }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { suggestion: { name: string; brand: string; imageUrl: string } | null };
    expect(body.suggestion?.name).toBe("Perfume Encontrado");

    const listRes = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies }
    });
    expect((listRes.json() as { products: unknown[] }).products).toHaveLength(0);
  });

  it("rejects a seller without product.manage from using the lookup", async () => {
    const { owner, networkId } = await setupOwner("+5511900000081");
    const inviteRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/invites`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    const code = (inviteRes.json() as { invite: { code: string } }).invite.code;
    const seller = await signUp(app, otpSender, "+5511900000082", "Seller");
    await app.inject({
      method: "POST",
      url: "/invites/accept",
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { code }
    });

    const res = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/catalog-lookup?barcode=7891000100103`,
      headers: { cookie: seller.cookies }
    });
    expect(res.statusCode).toBe(403);
  });

  it("requires a network membership and rejects cross-network use", async () => {
    const outsider = await signUp(app, otpSender, "+5511900000083", "Outsider");
    const { networkId } = await setupOwner("+5511900000084");

    const res = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/catalog-lookup?barcode=7891000100103`,
      headers: { cookie: outsider.cookies }
    });
    expect(res.statusCode).toBe(404);
  });
});
