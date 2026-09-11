import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  sessionCookieSecret: required("SESSION_COOKIE_SECRET"),
  otpSender: (process.env.OTP_SENDER ?? "console") as "console" | "brevo",
  // Only required when otpSender === "brevo" — validated at startup in app.ts's
  // defaultOtpSender(), not here, so OTP_SENDER=console (the default) never demands
  // Brevo credentials that a local/dev setup has no reason to have.
  brevoApiKey: process.env.BREVO_API_KEY,
  brevoFromEmail: process.env.BREVO_FROM_EMAIL,
  brevoFromName: process.env.BREVO_FROM_NAME ?? "Estoque Vivo",
  // "none" (default) disables catalog lookup entirely — manual entry always works
  // regardless. "openbeauty facts" opts into an outbound call to a third-party API on
  // every barcode lookup the Owner triggers — see apps/api/src/modules/catalog/catalog-provider.ts
  // and docs/decisions/ADR-005-catalog-provider.md before enabling it.
  catalogProvider: (process.env.CATALOG_PROVIDER ?? "none") as "none" | "openbeautyfacts",
  isProduction: process.env.NODE_ENV === "production"
};
