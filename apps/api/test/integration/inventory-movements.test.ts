import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { buildTestApp, resetDatabase, signUp, type CapturingOtpSender } from "./setup";

describe("stock movements (Slice 2)", () => {
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

  async function setupNetworkWithProduct(ownerPhone: string, initialQuantity: number) {
    const owner = await signUp(app, otpSender, ownerPhone, "Owner");
    const networkRes = await app.inject({
      method: "POST",
      url: "/networks",
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Network" }
    });
    const networkId = (networkRes.json() as { network: { id: string } }).network.id;

    const productRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Perfume", initialOnHandQuantity: initialQuantity }
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;

    return { owner, networkId, productId };
  }

  it("lets the owner record a RESTOCK movement and increases on-hand/available quantity", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000030", 5);

    const res = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { type: "RESTOCK", quantityDelta: 10, reason: "Compra de reposição" }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { product: { onHandQuantity: number; availableQuantity: number } };
    expect(body.product.onHandQuantity).toBe(15);
    expect(body.product.availableQuantity).toBe(15);
  });

  it("rejects a movement that would take on-hand stock below zero", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000031", 3);

    const res = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { type: "ADJUSTMENT_LOSS", quantityDelta: -5, reason: "Contagem" }
    });

    expect(res.statusCode).toBe(409);
  });

  it("rejects a RESTOCK with a negative delta and an ADJUSTMENT_LOSS with a positive one", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000032", 5);

    const badRestock = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { type: "RESTOCK", quantityDelta: -1, reason: "x" }
    });
    expect(badRestock.statusCode).toBe(400);

    const badLoss = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { type: "ADJUSTMENT_LOSS", quantityDelta: 1, reason: "x" }
    });
    expect(badLoss.statusCode).toBe(400);
  });

  it("rejects a movement with no reason", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000033", 5);

    const res = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { type: "RESTOCK", quantityDelta: 1, reason: "" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a seller without inventory.adjust from recording a movement", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000034", 5);

    const inviteRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/invites`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    const code = (inviteRes.json() as { invite: { code: string } }).invite.code;

    const seller = await signUp(app, otpSender, "+5511900000035", "Seller");
    await app.inject({
      method: "POST",
      url: "/invites/accept",
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { code }
    });

    const res = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { type: "RESTOCK", quantityDelta: 1, reason: "tentativa" }
    });
    expect(res.statusCode).toBe(403);
  });

  it("records who/when/why and lists movement history newest-first, readable via audit.read", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000036", 5);

    await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { type: "RESTOCK", quantityDelta: 5, reason: "Primeira reposição" }
    });
    await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { type: "ADJUSTMENT_LOSS", quantityDelta: -2, reason: "Produto danificado" }
    });

    const historyRes = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: owner.cookies }
    });
    expect(historyRes.statusCode).toBe(200);
    const movements = (historyRes.json() as { movements: Array<{ type: string; quantityDelta: number; reason: string }> })
      .movements;
    expect(movements).toHaveLength(2);
    expect(movements[0].type).toBe("ADJUSTMENT_LOSS");
    expect(movements[0].quantityDelta).toBe(-2);
    expect(movements[1].type).toBe("RESTOCK");
    expect(movements[1].reason).toBe("Primeira reposição");
  });

  it("rejects a seller without audit.read from viewing movement history", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000037", 5);

    const inviteRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/invites`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    const code = (inviteRes.json() as { invite: { code: string } }).invite.code;
    const seller = await signUp(app, otpSender, "+5511900000038", "Seller");
    await app.inject({
      method: "POST",
      url: "/invites/accept",
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { code }
    });

    const res = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: seller.cookies }
    });
    expect(res.statusCode).toBe(403);
  });
});
