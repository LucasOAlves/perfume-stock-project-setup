import { ExternalServiceError } from "../../shared/errors";

// External, volatile boundary behind an interface per ADR-001/ADR-004.
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

// Dev-only. Never use in production — see apps/api/.env.example and ADR-009.
export class ConsoleOtpSender implements OtpSender {
  async send(phone: string, code: string): Promise<void> {
    console.log(`[dev-otp] OTP for ${maskPhone(phone)}: ${code}`);
  }
}

// Real SMS delivery via Twilio's Messages API — see ADR-009-otp-delivery-channel.md for
// why SMS (not WhatsApp Business API) and why Twilio. Plain fetch against Twilio's REST
// API, not the Twilio SDK — the same "no dependency for one endpoint" call already made
// for catalog-provider.ts, and it keeps this adapter as easy to read as it is to swap out.
export class TwilioOtpSender implements OtpSender {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string
  ) {}

  async send(phone: string, code: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: phone,
      From: this.fromNumber,
      Body: `Seu código Estoque Vivo: ${code}. Válido por 5 minutos. Não compartilhe.`
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body,
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      // Network failure/timeout reaching Twilio — never leak this as a raw error to the
      // client (security-model.md "Data Handling / Logging"); the caller (IdentityService)
      // has already persisted the OTP challenge, so the user can just retry.
      throw new ExternalServiceError("Não foi possível enviar o código por SMS agora, tente novamente");
    }

    if (!response.ok) {
      // Twilio's error body may include the phone number we just sent to — never log it
      // verbatim (see maskPhone below), and never forward provider error text to the client.
      throw new ExternalServiceError("Não foi possível enviar o código por SMS agora, tente novamente");
    }
  }
}

// Never log a full phone number — see security model "Data Handling / Logging".
function maskPhone(phone: string): string {
  return phone.length <= 4 ? "****" : `${phone.slice(0, phone.length - 4).replace(/./g, "*")}${phone.slice(-4)}`;
}
