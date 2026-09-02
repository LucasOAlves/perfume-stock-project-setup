import { describe, expect, it } from "vitest";
import { generateNumericCode, generateToken, hashSecret, verifySecret } from "../../src/shared/crypto";

describe("crypto helpers", () => {
  it("hashes and verifies a matching secret", () => {
    const code = generateNumericCode(6);
    const hash = hashSecret(code);
    expect(verifySecret(code, hash)).toBe(true);
  });

  it("rejects a non-matching secret", () => {
    const hash = hashSecret("123456");
    expect(verifySecret("654321", hash)).toBe(false);
  });

  it("generates numeric codes of the requested length", () => {
    const code = generateNumericCode(6);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("generates URL-safe, non-empty tokens", () => {
    const token = generateToken(24);
    expect(token.length).toBeGreaterThan(0);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never reuses the same salt across two hashes of the same secret", () => {
    const a = hashSecret("123456");
    const b = hashSecret("123456");
    expect(a).not.toEqual(b);
    expect(verifySecret("123456", a)).toBe(true);
    expect(verifySecret("123456", b)).toBe(true);
  });
});
