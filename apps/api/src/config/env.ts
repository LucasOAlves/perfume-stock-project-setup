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
  // Path to a CA bundle (AWS's RDS global bundle in the production image). Unset = no TLS.
  databaseSslCaPath: process.env.DATABASE_SSL_CA_PATH,
  // Number of reverse proxies in front of the API whose X-Forwarded-For entry is trusted
  // (0 = none, the default: request.ip is the socket address). Behind CloudFront -> EC2
  // it must be exactly 1; "true" (trust every hop) would let a client spoof its IP and
  // dodge the per-IP OTP rate limit — see ADR-011.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
  // Path prefix CloudFront routes to the API (e.g. "/api"); stripped before routing so the
  // routes themselves stay prefix-free. Empty in local dev and tests.
  apiPathPrefix: process.env.API_PATH_PREFIX ?? "",
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
