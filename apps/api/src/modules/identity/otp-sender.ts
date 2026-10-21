import { ExternalServiceError } from "../../shared/errors";

// External, volatile boundary behind an interface per ADR-001/ADR-004.
export interface OtpSender {
  send(email: string, code: string): Promise<void>;
}

// Dev-only. Never use in production — see apps/api/.env.example and ADR-010.
export class ConsoleOtpSender implements OtpSender {
  async send(email: string, code: string): Promise<void> {
    console.log(`[dev-otp] OTP for ${maskEmail(email)}: ${code}`);
  }
}

// Real email delivery via Brevo's transactional email API — see
// ADR-010-otp-channel-cost-optimization.md for why email (not SMS/WhatsApp) and why
// Brevo specifically: free tier (300 emails/day, no card required) and, unlike Resend,
// verifying a single sender *address* is enough — no owned domain or DNS records needed.
// Plain fetch, not Brevo's SDK — same "no dependency for one endpoint" choice already
// made for catalog-provider.ts and the earlier Twilio adapter this one replaces.
export class BrevoOtpSender implements OtpSender {
  private static readonly API_URL = "https://api.brevo.com/v3/smtp/email";

  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
    private readonly fromName: string
  ) {}

  async send(email: string, code: string): Promise<void> {
    const payload = {
      sender: { email: this.fromEmail, name: this.fromName },
      to: [{ email }],
      subject: `${code} é o seu código de acesso ao Estoque Vivo`,
      textContent: `Seu código de acesso ao Estoque Vivo: ${code}\n\nVálido por 5 minutos. Não compartilhe este código com ninguém.`
    };

    let response: Response;
    try {
      response = await fetch(BrevoOtpSender.API_URL, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });
    } catch (err) {
      console.error(
        `[brevo] request failed for ${maskEmail(email)}: ${err instanceof Error ? err.name : "unknown error"}`
      );
      // Network failure/timeout reaching Brevo — never leak this as a raw error to the
      // client (security-model.md "Data Handling / Logging"); the caller (IdentityService)
      // has already persisted the OTP challenge, so the user can just retry.
      throw new ExternalServiceError("Não foi possível enviar o código por e-mail agora, tente novamente");
    }

    if (!response.ok) {
      // Brevo's error body may include the address we just sent to — log it only with every
      // address redacted, and never forward provider error text to the client. The log is the
      // only way to tell a rejected key, an unverified sender or a blocked IP apart.
      const body = await response.text().catch(() => "");
      console.error(
        `[brevo] send to ${maskEmail(email)} rejected: HTTP ${response.status} ${redactEmails(body).slice(0, 500)}`
      );
      throw new ExternalServiceError("Não foi possível enviar o código por e-mail agora, tente novamente");
    }
  }
}

// Never log a full email address — see security model "Data Handling / Logging".
export function redactEmails(text: string): string {
  return text.replace(/[^\s"'<>@]+@[^\s"'<>@]+\.[^\s"'<>@]+/g, (match) => maskEmail(match));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "****";
  const maskedLocal = local.length <= 2 ? "**" : `${local[0]}${"*".repeat(local.length - 1)}`;
  return `${maskedLocal}@${domain}`;
}
