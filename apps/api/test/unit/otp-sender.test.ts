import { describe, expect, it } from "vitest";
import { redactEmails } from "../../src/modules/identity/otp-sender";

describe("redactEmails", () => {
  it("masks every address in a provider error body", () => {
    const body = '{"code":"invalid_parameter","message":"sender lucas@example.com is not valid for to@example.org"}';
    const redacted = redactEmails(body);
    expect(redacted).not.toContain("lucas@");
    expect(redacted).not.toContain("to@");
    expect(redacted).toContain("l****@example.com");
    expect(redacted).toContain('"code":"invalid_parameter"');
  });

  it("leaves text without addresses untouched", () => {
    const body = '{"code":"unauthorized","message":"Key not found"}';
    expect(redactEmails(body)).toBe(body);
  });
});
