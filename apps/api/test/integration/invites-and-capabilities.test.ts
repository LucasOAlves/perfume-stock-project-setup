import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { buildTestApp, resetDatabase, signUp, type CapturingOtpSender } from "./setup";

describe("invites and capability enforcement", () => {
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

  async function createNetworkWithOwner(email: string) {
    const owner = await signUp(app, otpSender, email, "Owner");
    const res = await app.inject({
      method: "POST",
      url: "/networks",
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Network" }
    });
    const networkId = (res.json() as { network: { id: string } }).network.id;
    return { owner, networkId };
  }

  it("lets a seller join via a valid invite and see (but not mutate) products", async () => {
    const { owner, networkId } = await createNetworkWithOwner("user11900000010@test.local");

    const inviteRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/invites`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    const code = (inviteRes.json() as { invite: { code: string } }).invite.code;

    const seller = await signUp(app, otpSender, "user11900000011@test.local", "Seller");
    const acceptRes = await app.inject({
      method: "POST",
      url: "/invites/accept",
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { code }
    });
    expect(acceptRes.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Perfume A", initialOnHandQuantity: 5 }
    });

    const listRes = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/products`,
      headers: { cookie: seller.cookies }
    });
    expect(listRes.statusCode).toBe(200);
    const products = (listRes.json() as { products: Array<{ availableQuantity: number }> }).products;
    expect(products).toHaveLength(1);
    expect(products[0].availableQuantity).toBe(5);

    const createAttempt = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products`,
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { name: "Perfume B" }
    });
    expect(createAttempt.statusCode).toBe(403);
  });

  it("rejects an invite code that has already been used (single-use)", async () => {
    const { owner, networkId } = await createNetworkWithOwner("user11900000012@test.local");
    const inviteRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/invites`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    const code = (inviteRes.json() as { invite: { code: string } }).invite.code;

    const firstSeller = await signUp(app, otpSender, "user11900000013@test.local", "Seller 1");
    await app.inject({
      method: "POST",
      url: "/invites/accept",
      headers: { cookie: firstSeller.cookies, "x-csrf-token": firstSeller.csrfToken },
      payload: { code }
    });

    const secondSeller = await signUp(app, otpSender, "user11900000014@test.local", "Seller 2");
    const secondAttempt = await app.inject({
      method: "POST",
      url: "/invites/accept",
      headers: { cookie: secondSeller.cookies, "x-csrf-token": secondSeller.csrfToken },
      payload: { code }
    });
    expect(secondAttempt.statusCode).toBe(400);
  });

  it("rejects a non-owner attempting to create an invite (member.manage is owner-exclusive)", async () => {
    const { owner, networkId } = await createNetworkWithOwner("user11900000015@test.local");
    const inviteRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/invites`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    const code = (inviteRes.json() as { invite: { code: string } }).invite.code;

    const seller = await signUp(app, otpSender, "user11900000016@test.local", "Seller");
    await app.inject({
      method: "POST",
      url: "/invites/accept",
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { code }
    });

    const escalationAttempt = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/invites`,
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken }
    });
    expect(escalationAttempt.statusCode).toBe(403);
  });

  it("rejects a stock quantity that would go negative at creation", async () => {
    const { owner, networkId } = await createNetworkWithOwner("user11900000017@test.local");
    const res = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Perfume C", initialOnHandQuantity: -1 }
    });
    expect(res.statusCode).toBe(400);
  });
});
