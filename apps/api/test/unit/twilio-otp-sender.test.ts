import { afterEach, describe, expect, it, vi } from "vitest";
import { TwilioOtpSender } from "../../src/modules/identity/otp-sender";
import { ExternalServiceError } from "../../src/shared/errors";

describe("TwilioOtpSender", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to Twilio's Messages API with Basic auth and the expected form body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const sender = new TwilioOtpSender("ACxxx", "secret-token", "+15550006789");
    await sender.send("+5511999998888", "123456");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages.json");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("ACxxx:secret-token").toString("base64")}`);

    const body = init.body as URLSearchParams;
    expect(body.get("To")).toBe("+5511999998888");
    expect(body.get("From")).toBe("+15550006789");
    expect(body.get("Body")).toContain("123456");
  });

  it("throws ExternalServiceError on a non-2xx response, without leaking Twilio's body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "invalid 'To' phone number" }), { status: 400 }))
    );

    const sender = new TwilioOtpSender("ACxxx", "secret-token", "+15550006789");
    await expect(sender.send("+5511999998888", "123456")).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it("throws ExternalServiceError when the network call itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const sender = new TwilioOtpSender("ACxxx", "secret-token", "+15550006789");
    await expect(sender.send("+5511999998888", "123456")).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
