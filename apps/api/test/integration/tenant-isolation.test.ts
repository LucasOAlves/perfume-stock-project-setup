import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { buildTestApp, resetDatabase, signUp, type CapturingOtpSender } from "./setup";

// Directly verifies docs/architecture/security-model.md's core invariant: changing a
// network_id (or a resource id belonging to another network) in a request must never
// return another network's data — the classic IDOR/BOLA check.
describe("tenant isolation", () => {
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

  it("prevents a member of network A from reading network B's products", async () => {
    const owner = await signUp(app, otpSender, "+5511900000001", "Owner");
    const outsider = await signUp(app, otpSender, "+5511900000002", "Outsider");

    const createNetworkRes = await app.inject({
      method: "POST",
      url: "/networks",
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Owner Network" }
    });
    const networkId = (createNetworkRes.json() as { network: { id: string } }).network.id;

    await app.inject({
      method: "POST",
      url: `/networks/${networkId}/products`,
      headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
      payload: { name: "Perfume X", initialOnHandQuantity: 10 }
    });

    const outsiderListRes = await app.inject({
      method: "GET",
      url: `/networks/${networkId}/products`,
      headers: { cookie: outsider.cookies }
    });

    expect(outsiderListRes.statusCode).toBe(404);
  });

  it("rejects an unauthenticated request to a protected endpoint", async () => {
    const res = await app.inject({ method: "GET", url: "/networks" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a mutating request without a matching CSRF token", async () => {
    const owner = await signUp(app, otpSender, "+5511900000003", "Owner");

    const res = await app.inject({
      method: "POST",
      url: "/networks",
      headers: { cookie: owner.cookies }, // no x-csrf-token header
      payload: { name: "No CSRF Network" }
    });

    expect(res.statusCode).toBe(403);
  });
});
