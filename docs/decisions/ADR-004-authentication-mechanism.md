# ADR-004 — Authentication: Phone + OTP, httpOnly Session Cookie

## Status

Accepted for the OTP/session/CSRF mechanism, which is unchanged. **The identifier and delivery channel described here (phone number, SMS/WhatsApp) were later replaced by email — see [ADR-010](ADR-010-otp-channel-cost-optimization.md).** Read "phone number" below as historical context for why OTP-based auth was chosen at all; the current identifier is email.

## Context

The visible business profile is intentionally minimal (display name + phone number), but the master prompt is explicit that a minimal profile must not mean weak authentication, and that phone number alone is never proof of identity.

## Decision Drivers

- Target users are non-technical resellers already comfortable with phone-number-based flows (WhatsApp-style) and are unlikely to reliably manage passwords or have a business email.
- Must not store plaintext credentials or use phone number alone as identity proof.
- Session transport choice affects XSS/CSRF exposure and must be decided alongside the mechanism.

## Options Considered

1. **Password-based login.** Rejected as primary: adds password-reset flows, password-storage hygiene burden, and a UX mismatch for the target users, for no clear benefit over OTP at this scale.
2. **Passkeys.** Attractive long-term, but device/browser support and user familiarity among this specific non-technical user base is unproven; adds implementation complexity for the MVP without a validated need. Worth revisiting once usage data exists.
3. **Magic link (email).** Rejected: email is not part of the minimal profile and isn't reliably owned/checked by this user base; would force collecting a field the product spec deliberately excludes.
4. **Phone + OTP** (SMS or WhatsApp Business API delivery). Matches the minimal profile, matches user familiarity, avoids password storage.

## Decision

**Phone + OTP**, with these safeguards (required, not optional, given the master prompt's explicit "phone number alone is not identity proof" rule):

- OTP codes are short-lived (target: 5 minutes), single-use, and rate-limited per phone number and per source IP with exponential backoff/lockout after repeated failures.
- OTP codes are never logged, including in error/debug logs (see security model).
- Successful OTP verification issues a server-side session, delivered as an **httpOnly, Secure, SameSite=Lax** cookie — not a token stored in `localStorage`/`sessionStorage` — to reduce XSS token-theft exposure, since XSS is explicitly in scope for security review.
- Because session transport is cookie-based, state-changing requests require CSRF protection (double-submit token or synchronizer token pattern) in addition to `SameSite`.
- OTP delivery channel (SMS vs. WhatsApp Business API) is an implementation detail decided during Slice 1 build (cost/deliverability tradeoff), not a product-scope or architecture question — does not need its own ADR unless it turns out to affect the session/identity model.

## Consequences

- No password storage, no password-reset support burden.
- Adds a dependency on a real OTP delivery provider (SMS gateway or WhatsApp Business API) — this is an external, volatile boundary and should sit behind an `OtpSender` interface per [ADR-001](ADR-001-architecture-style.md).
- CSRF protection must be implemented from Slice 1 onward since it's a consequence of choosing cookie-based sessions now, not something to bolt on later.

## Tradeoffs

Gained: low friction for the actual user base, no credential-storage risk. Given up: passkey-level phishing resistance (acceptable given user base and MVP timeline; revisit if account-takeover incidents occur).

## Security/Operational Impact

OTP brute-force and invite-link theft are the two identity-adjacent attack surfaces flagged in `docs/architecture/security-model.md` — both must be mitigated from Slice 1, not deferred.

## Revisit When

Passkey adoption among the target demographic becomes evidenced, or OTP delivery cost/deliverability (SMS pricing, WhatsApp API approval) makes the channel choice itself worth its own ADR.
