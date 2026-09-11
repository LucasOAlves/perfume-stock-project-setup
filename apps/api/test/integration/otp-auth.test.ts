import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { buildTestApp, resetDatabase, type CapturingOtpSender } from "./setup";

describe("email + OTP authentication", () => {
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

  it("rejects an incorrect OTP code", async () => {
    const email = "user11900000020@test.local";
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email } });

    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { email, code: "000000" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("rate-limits repeated OTP requests for the same email number", async () => {
    const email = "user11900000021@test.local";
    const responses = [];
    for (let i = 0; i < 6; i++) {
      responses.push(await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email } }));
    }
    expect(responses.some((r) => r.statusCode === 429)).toBe(true);
  });

  it("locks out after too many incorrect verify attempts for the same challenge", async () => {
    const email = "user11900000022@test.local";
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email } });

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/otp/verify",
        payload: { email, code: "111111" }
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  it("issues a working session on the correct code, usable via /auth/me", async () => {
    const email = "user11900000023@test.local";
    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { email } });
    const code = otpSender.codeFor(email);

    const verifyRes = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { email, code, displayName: "Ana" }
    });
    expect(verifyRes.statusCode).toBe(200);

    const sessionCookie = verifyRes.cookies.find((c) => c.name === "session_id");
    const meRes = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: `session_id=${sessionCookie?.value}` }
    });
    expect(meRes.statusCode).toBe(200);
    expect((meRes.json() as { user: { displayName: string } }).user.displayName).toBe("Ana");
  });
});
