// External, volatile boundary behind an interface per ADR-001/ADR-004.
// The only implementation shipped in this MVP logs to the console instead of sending
// a real SMS/WhatsApp message — see apps/api/.env.example. Do not use in production;
// swap in a real SMS/WhatsApp Business API adapter behind this same interface.
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

export class ConsoleOtpSender implements OtpSender {
  async send(phone: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[dev-otp] OTP for ${maskPhone(phone)}: ${code}`);
  }
}

// Never log a full phone number — see security model "Data Handling / Logging".
function maskPhone(phone: string): string {
  return phone.length <= 4 ? "****" : `${phone.slice(0, phone.length - 4).replace(/./g, "*")}${phone.slice(-4)}`;
}
