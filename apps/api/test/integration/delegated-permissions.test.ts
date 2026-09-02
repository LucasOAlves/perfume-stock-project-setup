import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { buildTestApp, resetDatabase, signUp, type CapturingOtpSender, type SignedUpUser } from "./setup";

// Slice 4 is the highest privilege-escalation-risk slice in the whole MVP — every test
// here maps directly to a threat listed in docs/architecture/security-model.md and the
// hardcoded-Owner-exclusivity rule in ADR-003.
describe("delegated capabilities (Slice 4)", () => {
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

  async function setupNetworkWithSeller(ownerPhone: string, sellerPhone: string) {
    const owner = await signUp(app, otpSender, ownerPhone, "Owner");
    const networkRes = await app.inject({
      method: "POST",
      url: "/networks",
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Network" }
    });
    const networkId = (networkRes.json() as { network: { id: string } }).network.id;

    const inviteRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/invites`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken }
    });
    const code = (inviteRes.json() as { invite: { code: string } }).invite.code;
    const seller = await signUp(app, otpSender, sellerPhone, "Seller");
    await app.inject({
      method: "POST",
      url: "/invites/accept",
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { code }
    });

    const membersRes = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/members`,
      headers: { cookie: owner.cookies }
    });
    const members = (membersRes.json() as { members: Array<{ id: string; isOwner: boolean }> }).members;
    const sellerMembershipId = members.find((m) => !m.isOwner)!.id;
    const ownerMembershipId = members.find((m) => m.isOwner)!.id;

    return { owner, seller, networkId, sellerMembershipId, ownerMembershipId };
  }

  function setCapabilities(
    actor: SignedUpUser,
    networkId: string,
    membershipId: string,
    capabilities: string[]
  ) {
    return app.inject({
      method: "PUT",
      url: `/networks/${networkId}/members/${membershipId}/capabilities`,
      headers: { cookie: actor.cookies, "x-csrf-token": actor.csrfToken },
      payload: { capabilities }
    });
  }

  it("lets the owner grant inventory.adjust to a seller, who can then record a movement", async () => {
    const { owner, seller, networkId, sellerMembershipId } = await setupNetworkWithSeller(
      "+5511900000060",
      "+5511900000061"
    );

    const productRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Perfume", initialOnHandQuantity: 5 }
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;

    // Before the grant: seller is rejected.
    const before = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { type: "RESTOCK", quantityDelta: 1, reason: "tentativa" }
    });
    expect(before.statusCode).toBe(403);

    const grantRes = await setCapabilities(owner, networkId, sellerMembershipId, ["inventory.read", "inventory.adjust"]);
    expect(grantRes.statusCode).toBe(200);

    // After the grant: seller succeeds.
    const after = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { type: "RESTOCK", quantityDelta: 3, reason: "reposição delegada" }
    });
    expect(after.statusCode).toBe(201);
  });

  it("blocks the seller immediately after the owner revokes the capability", async () => {
    const { owner, seller, networkId, sellerMembershipId } = await setupNetworkWithSeller(
      "+5511900000062",
      "+5511900000063"
    );
    const productRes = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Perfume", initialOnHandQuantity: 5 }
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;

    await setCapabilities(owner, networkId, sellerMembershipId, ["inventory.adjust"]);
    const granted = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { type: "RESTOCK", quantityDelta: 1, reason: "ok" }
    });
    expect(granted.statusCode).toBe(201);

    // Revoke by replacing with the default set (no inventory.adjust).
    await setCapabilities(owner, networkId, sellerMembershipId, ["inventory.read", "reservation.create", "reservation.cancel.own"]);

    const revoked = await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products/${productId}/movements`,
      headers: { cookie: seller.cookies, "x-csrf-token": seller.csrfToken },
      payload: { type: "RESTOCK", quantityDelta: 1, reason: "bloqueado" }
    });
    expect(revoked.statusCode).toBe(403);
  });

  it("rejects a non-owner from changing anyone's capabilities, even one holding every other capability", async () => {
    const { owner, seller, networkId, sellerMembershipId } = await setupNetworkWithSeller(
      "+5511900000064",
      "+5511900000065"
    );

    // Grant the seller every real capability there is.
    await setCapabilities(owner, networkId, sellerMembershipId, [
      "inventory.read",
      "reservation.create",
      "reservation.cancel.own",
      "reservation.cancel.any",
      "inventory.adjust",
      "product.manage",
      "audit.read"
    ]);

    // Even fully capable, the seller cannot grant themselves (or anyone) capabilities —
    // requireOwner() is the only gate, and it is not satisfiable via any capability.
    const selfGrantAttempt = await setCapabilities(seller, networkId, sellerMembershipId, ["product.manage"]);
    expect(selfGrantAttempt.statusCode).toBe(403);
  });

  it("rejects member.manage and permission.manage as capability values at the schema level", async () => {
    const { owner, networkId, sellerMembershipId } = await setupNetworkWithSeller("+5511900000066", "+5511900000067");

    const res = await setCapabilities(owner, networkId, sellerMembershipId, ["permission.manage"]);
    expect(res.statusCode).toBe(400);

    const res2 = await setCapabilities(owner, networkId, sellerMembershipId, ["member.manage"]);
    expect(res2.statusCode).toBe(400);
  });

  it("rejects setting capabilities on the owner's own membership", async () => {
    const { owner, networkId, ownerMembershipId } = await setupNetworkWithSeller("+5511900000068", "+5511900000069");

    const res = await setCapabilities(owner, networkId, ownerMembershipId, ["product.manage"]);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-owner from reading another member's capability grants", async () => {
    const { seller, networkId, sellerMembershipId } = await setupNetworkWithSeller("+5511900000070", "+5511900000071");

    const res = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/members/${sellerMembershipId}/capabilities`,
      headers: { cookie: seller.cookies }
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets the owner read a member's current capability grants", async () => {
    const { owner, networkId, sellerMembershipId } = await setupNetworkWithSeller("+5511900000072", "+5511900000073");
    await setCapabilities(owner, networkId, sellerMembershipId, ["product.manage", "audit.read"]);

    const res = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/members/${sellerMembershipId}/capabilities`,
      headers: { cookie: owner.cookies }
    });
    expect(res.statusCode).toBe(200);
    const capabilities = (res.json() as { capabilities: string[] }).capabilities.sort();
    expect(capabilities).toEqual(["audit.read", "product.manage"]);
  });
});
