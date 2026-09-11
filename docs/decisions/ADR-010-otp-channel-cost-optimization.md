# ADR-010 — OTP Channel Changed to Email (via Brevo), Identity Moves from Phone to Email

## Status

Accepted. Supersedes [ADR-009](ADR-009-otp-delivery-channel.md).

## Context

ADR-009 shipped `TwilioOtpSender` — real, tested, and working — but no Twilio account was ever created for it, because the very next request was explicit: minimize ongoing cost, and SMS/WhatsApp were no longer required by name. Twilio SMS has a real per-message cost from the first send; email delivery does not, at this project's volume.

This isn't only a sender swap. The MVP's identity model has been phone-first since Slice 1 (`docs/product/product-spec.md`, `docs/decisions/ADR-004-authentication-mechanism.md`) — `UserEntity.phone` is the unique account key, not just the OTP destination. Sending an OTP by email while still keying accounts by phone would mean asking for both, which adds friction without removing the phone-collection step ADR-009 was trying to make free. The only way to actually reach zero marginal cost is to make email the account identifier itself, not an extra field alongside phone.

## Decision Drivers

- **Cost, explicitly prioritized over channel preference this time.** The request that produced this ADR named cost minimization as the goal and left the channel open ("não precisa ser SMS ou WhatsApp, pode ser e-mail ou outra maneira").
- Free-tier transactional email (Brevo: 300/day, no card; Resend: 3,000/month but requires an owned, DNS-verified domain) reaches effectively zero cost at this project's expected volume, unlike SMS (Twilio: paid per message from message one) or WhatsApp Business API (also paid per conversation past Meta's free allotment, plus the Business-verification lift ADR-009 already declined to block on).
- No owned domain exists yet for this project — a hard constraint that rules out Resend's normal setup (domain-verified sending) in favor of a provider that verifies a single sender **address** instead.
- Whatever ships must still reuse `IdentityService`'s existing code generation, hashing, rate-limiting, and lockout logic (ADR-009's same reasoning against Twilio Verify applies identically against any provider that wants to own code generation itself) — only the destination field and the `OtpSender` implementation should change.

## Options Considered

1. **Keep phone as identifier, add email only for OTP delivery.** Rejected — doesn't remove the friction of collecting a phone number, and maintaining two contact fields per user for no product reason is complexity the MVP doesn't need.
2. **Switch identifier to email, send via Resend.** Rejected for now — Resend's free tier requires a DNS-verified domain the project doesn't have; adding "buy and configure a domain" as a prerequisite works against the cost-minimization goal driving this change (domains aren't free, and DNS setup is another manual step).
3. **Switch identifier to email, send via Brevo.** Chosen — free tier (300 emails/day) requires only a single verified sender **address** (confirmed by clicking a link Brevo emails you), not a domain. Reaches zero cost immediately with the account owner's existing email address.
4. **WhatsApp Cloud API's own free tier (Meta, not Twilio).** Not evaluated further — still requires the Meta Business verification and template pre-approval ADR-009 already declined to block the MVP on; the cost savings don't remove that operational lift.

## Decision

**Identity moves from phone to email** across the stack: `UserEntity.phone` → `UserEntity.email` (unique), `OtpChallengeEntity.phone` → `.email`, `IdentityService`'s E.164 validation → a basic email-shape check plus case-insensitive normalization (`normalizeEmail` — `Ana@X.com` and `ana@x.com` must be the same account and the same rate-limit bucket), the `/auth/otp/*` request bodies, and the login form (`apps/web`'s phone/DDD region picker is gone — a plain `type="email"` input replaces it, and the now-unused `core/phone-format.ts` masked-input helper was deleted rather than left dead).

**`BrevoOtpSender`** replaces `TwilioOtpSender` in `apps/api/src/modules/identity/otp-sender.ts` — same shape as the Twilio adapter it replaces (plain `fetch` against Brevo's REST API, no SDK dependency, matching `OpenBeautyFactsCatalogProvider`'s pattern), selected via `OTP_SENDER=brevo` plus `BREVO_API_KEY` / `BREVO_FROM_EMAIL` (a sender address verified in the account owner's own Brevo dashboard) / `BREVO_FROM_NAME`. `OTP_SENDER=console` remains the default; local dev is unaffected. Startup validation (`defaultOtpSender()` in `apps/api/src/app.ts`) follows the same "fail loudly on boot, not on a user's first login" pattern ADR-009 established.

Because this project has no production deployment or real user data yet, the `users`/`otp_challenges` columns were renamed in place inside the existing `1700000000000-InitSchema.ts` migration, rather than adding a new migration that immediately reverses part of an earlier one — there is nothing to migrate away from. Later migrations (`AddStockMovements`, `AddReservations`) don't touch these tables and were left untouched.

## Consequences

- OTP delivery reaches $0 marginal cost at this project's expected MVP volume, addressing the cost-minimization request directly.
- The account owner still can't be onboarded automatically — creating the Brevo account and verifying one sender address is a manual step outside this codebase, same category of gap ADR-009 already had with Twilio.
- Every reference to "phone" as the account identifier across code, tests, and docs needed updating in the same change — a wider diff than a pure sender swap, but avoids leaving the codebase internally inconsistent about what identifies a user.
- Product-facing consequence: login now asks for an email address, not a phone number, for the target Brazilian-reseller audience that (per `docs/product/product-spec.md`) is more WhatsApp-native than email-native day to day. This is a real UX trade accepted in exchange for the cost savings — not a free win.

## Tradeoffs

Gained: effectively free OTP delivery, no per-message cost anxiety at any signup volume this MVP is likely to see soon. Given up: the channel and identifier originally chosen to match how the target users actually communicate (phone/WhatsApp) — email login is more friction for users who don't check email often, and reopens the exact "vs WhatsApp Business API" trade ADR-009 already weighed, only now decided against the users' likely preference in favor of cost.

## Security/Operational Impact

`BREVO_API_KEY` is a real secret — never commit it (already covered by `.gitignore` per ADR-007) and belongs in the same "secrets vault for production" gap the Deploy track already flags, not the CI workflow (ADR-008 has no production secrets today). Brevo's own error responses are never forwarded to the client or logged verbatim (`maskEmail` in `otp-sender.ts` masks the local part before any log line) — matching `docs/architecture/security-model.md` "Data Handling / Logging". The `uq_users_email` constraint and `normalizeEmail` together prevent the same case-sensitivity bypass ADR-004's phone-based lockout logic was written to prevent.

## Revisit When

Real usage data shows email OTP delivery or open rates are meaningfully worse for this specific audience than phone-based channels would have been — at that point, a `WhatsAppOtpSender` or SMS sender can be added back behind the same `OtpSender` interface, this time as an opt-in second identifier/channel rather than a wholesale identity-model change. Also revisit if the project acquires its own domain — Resend's larger free tier (3,000/month vs. Brevo's ~9,000/month at 300/day, comparable in practice) becomes a viable, equally-free alternative at that point.
