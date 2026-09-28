import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { buildTestApp } from "./setup";

describe("client errors raised by Fastify", () => {
  let app: FastifyInstance;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
    await dataSource.destroy();
  });

  it("answers an unsupported Content-Type with 415, not 500", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "email=a@example.com"
    });
    expect(res.statusCode).toBe(415);
    expect((res.json() as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
  });

  it("answers malformed JSON with 400, not 500", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      headers: { "content-type": "application/json" },
      payload: "{not json"
    });
    expect(res.statusCode).toBe(400);
  });

  it("does not leak Fastify's own error text to the client", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/request",
      headers: { "content-type": "text/plain" },
      payload: "x"
    });
    expect(res.body).not.toMatch(/Unsupported Media Type|FST_ERR/);
  });
});
