import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { buildTestApp, resetDatabase, signUp, type CapturingOtpSender, type SignedUpUser } from "./setup";

describe("reservations (Slice 3)", () => {
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

  async function addSeller(owner: SignedUpUser, networkId: string, phone: string, displayName: string) {
    const inviteRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/invites`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    const code = (inviteRes.json() as { invite: { code: string } }).invite.code;
    const seller = await signUp(app, otpSender, phone, displayName);
    await app.inject({
      method: "POST",
      url: "/invites/accept",
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { code }
    });
    return seller;
  }

  function reserve(
    seller: SignedUpUser,
    networkId: string,
    productId: string,
    quantity: number,
    idempotencyKey?: string
  ) {
    return app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/reservations`,
      headers: {
        cookie: seller.cookies,
        "x-csrf-token": seller.csrfToken,
        "idempotency-key": idempotencyKey ?? randomUUID()
      },
      payload: { quantity }
    });
  }

  it("lets a member reserve available stock and reduces available quantity", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000040", 5);

    const res = await reserve(owner, networkId, productId, 2);
    expect(res.statusCode).toBe(201);

    const listRes = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies }
    });
    const product = (listRes.json() as { products: Array<{ availableQuantity: number; reservedQuantity: number }> })
      .products[0];
    expect(product.reservedQuantity).toBe(2);
    expect(product.availableQuantity).toBe(3);
  });

  it("rejects a reservation that exceeds available quantity", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000041", 3);

    const res = await reserve(owner, networkId, productId, 4);
    expect(res.statusCode).toBe(409);
  });

  it("requires an Idempotency-Key header", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000042", 3);

    const res = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/reservations`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { quantity: 1 }
    });
    expect(res.statusCode).toBe(400);
  });

  it("replays the same reservation instead of double-reserving on a retried request with the same Idempotency-Key", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000043", 3);
    const key = randomUUID();

    const first = await reserve(owner, networkId, productId, 2, key);
    const second = await reserve(owner, networkId, productId, 2, key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const firstId = (first.json() as { reservation: { id: string } }).reservation.id;
    const secondId = (second.json() as { reservation: { id: string } }).reservation.id;
    expect(secondId).toBe(firstId);

    const listRes = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies }
    });
    const product = (listRes.json() as { products: Array<{ reservedQuantity: number }> }).products[0];
    expect(product.reservedQuantity).toBe(2); // not 4 — the retry did not create a second reservation
  });

  // THE core concurrency-correctness test — see ADR-002. Two sellers race for the last
  // unit; exactly one reservation must succeed, and the other must get a clean conflict,
  // never a silent over-reservation.
  it("allows exactly one of two concurrent reservations for the last unit to succeed", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000044", 1);
    const sellerA = await addSeller(owner, networkId, "+5511900000045", "Seller A");
    const sellerB = await addSeller(owner, networkId, "+5511900000046", "Seller B");

    const [resA, resB] = await Promise.all([
      reserve(sellerA, networkId, productId, 1),
      reserve(sellerB, networkId, productId, 1)
    ]);

    const statuses = [resA.statusCode, resB.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const listRes = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies }
    });
    const product = (listRes.json() as { products: Array<{ reservedQuantity: number; availableQuantity: number }> })
      .products[0];
    expect(product.reservedQuantity).toBe(1);
    expect(product.availableQuantity).toBe(0);
  });

  it("restores availability when a reservation is cancelled, and cancelling twice is idempotent", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000047", 5);
    const createRes = await reserve(owner, networkId, productId, 2);
    const reservationId = (createRes.json() as { reservation: { id: string } }).reservation.id;

    const cancelRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/reservations/${reservationId}/cancel`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    expect(cancelRes.statusCode).toBe(200);

    const secondCancel = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/reservations/${reservationId}/cancel`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    expect(secondCancel.statusCode).toBe(200); // idempotent, not an error

    const listRes = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies }
    });
    const product = (listRes.json() as { products: Array<{ availableQuantity: number }> }).products[0];
    expect(product.availableQuantity).toBe(5);
  });

  it("prevents one seller from cancelling another seller's reservation without reservation.cancel.any", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000048", 5);
    const sellerA = await addSeller(owner, networkId, "+5511900000049", "Seller A");
    const sellerB = await addSeller(owner, networkId, "+5511900000050", "Seller B");

    const createRes = await reserve(sellerA, networkId, productId, 1);
    const reservationId = (createRes.json() as { reservation: { id: string } }).reservation.id;

    const res = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/reservations/${reservationId}/cancel`,
      headers: { cookie: sellerB.cookies, "x-csrf-token": sellerB.csrfToken }
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets the owner cancel any member's reservation via reservation.cancel.any", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000051", 5);
    const seller = await addSeller(owner, networkId, "+5511900000052", "Seller");

    const createRes = await reserve(seller, networkId, productId, 1);
    const reservationId = (createRes.json() as { reservation: { id: string } }).reservation.id;

    const res = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/reservations/${reservationId}/cancel`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    expect(res.statusCode).toBe(200);
  });

  it("fulfils a reservation: closes it and decrements on-hand and reserved together via a SALE_FROM_RESERVATION movement", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000053", 5);
    const createRes = await reserve(owner, networkId, productId, 2);
    const reservationId = (createRes.json() as { reservation: { id: string } }).reservation.id;

    const fulfillRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/reservations/${reservationId}/fulfill`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { reason: "Venda confirmada" }
    });
    expect(fulfillRes.statusCode).toBe(200);
    const body = fulfillRes.json() as {
      product: { onHandQuantity: number; reservedQuantity: number; availableQuantity: number };
      movement: { type: string; quantityDelta: number };
    };
    expect(body.product.onHandQuantity).toBe(3);
    expect(body.product.reservedQuantity).toBe(0);
    expect(body.product.availableQuantity).toBe(3);
    expect(body.movement.type).toBe("SALE_FROM_RESERVATION");
    expect(body.movement.quantityDelta).toBe(-2);

    // Cannot fulfil the same reservation twice.
    const secondFulfill = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/reservations/${reservationId}/fulfill`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { reason: "Venda confirmada" }
    });
    expect(secondFulfill.statusCode).toBe(409);
  });

  it("rejects a seller without inventory.adjust from fulfilling a reservation", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000054", 5);
    const seller = await addSeller(owner, networkId, "+5511900000055", "Seller");
    const createRes = await reserve(seller, networkId, productId, 1);
    const reservationId = (createRes.json() as { reservation: { id: string } }).reservation.id;

    const res = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/reservations/${reservationId}/fulfill`,
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { reason: "tentativa" }
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets a member list their own reservations", async () => {
    const { owner, networkId, productId } = await setupNetworkWithProduct("+5511900000056", 5);
    await reserve(owner, networkId, productId, 1);
    await reserve(owner, networkId, productId, 1);

    const res = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/reservations/mine`,
      headers: { cookie: owner.cookies }
    });
    expect(res.statusCode).toBe(200);
    const reservations = (res.json() as { reservations: unknown[] }).reservations;
    expect(reservations).toHaveLength(2);
  });
});
