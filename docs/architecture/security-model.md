# Shared Stock — Security Model

Status: draft, post-discovery. Owner: Security Reviewer agent. Treat this as the checklist for every slice's security review, not a one-time document.

## Threat Model Summary

The two blocking failure classes for this product are **cross-network access** (a Seller reading or mutating a Sales Network they don't belong to) and **privilege escalation** (a Membership gaining a capability the Owner didn't grant). Everything else in this document is real but secondary to those two.

## Authentication (see [ADR-004](../decisions/ADR-004-authentication-mechanism.md))

- OTP: 5-minute expiry, single-use, rate-limited per phone number and per source IP, exponential backoff/lockout on repeated failures. Never logged, in any log level, including error/debug output.
- Session: httpOnly, Secure, SameSite=Lax cookie. No token in `localStorage`/`sessionStorage`.
- CSRF: required on all state-changing requests because the session is cookie-based — double-submit or synchronizer token pattern, checked server-side.
- Phone number is personal data: store it, but do not expose another member's full phone number in any API response beyond what the product genuinely needs (display name is the default identifier shown to other members; full phone visible to the Owner and to the phone's own owner only, unless a real need for broader visibility is demonstrated).

## Tenant / Network Isolation

- Every table holding network-owned data carries an explicit `network_id`. Every query touching such a table filters on it.
- `network_id` arriving in a request (path, query, or body) is **never** trusted directly — it is used only as a lookup key, re-validated against the authenticated User's own Memberships on every single request. A Membership row for `(user_id, network_id)` must be found and `active` before any read or write proceeds.
- Security review of every new endpoint must explicitly ask: "if I change only the `network_id` (or `product_id`/`reservation_id` belonging to another network) in this request, do I get 403/404, or do I get another network's data?" — this is the IDOR/BOLA check required by `.agents/security-reviewer.md` and must be part of the API integration test suite (`.agents/qa-engineer.md`), not just manual review.
- Resource IDs referenced in a request (e.g. `product_id`, `reservation_id`) must be checked for both existence *and* membership in the request's own `network_id` — fetching by ID alone without a network filter is the specific bug pattern to search for in review.

## Authorization (see [ADR-003](../decisions/ADR-003-authorization-model.md))

- No endpoint may check a boolean like `isAdmin`; every protected mutation checks a specific capability against the caller's resolved Membership.
- `member.manage` and `permission.manage` are hardcoded to `is_owner = true` — never satisfiable by any capability grant. Security review must specifically attempt (in tests) to have a non-owner Membership call these endpoints, including one holding every other capability, and confirm rejection.
- Frontend guards, hidden buttons, and disabled UI states are UX only. They are not treated as a security control anywhere in review or testing — every capability check is re-verified assuming a client that sends any request it wants.

## Invitation / Linking

- Invite tokens are high-entropy, single-use, network-scoped, and time-limited (`docs/product/domain-model.md` — `Invite.code`). Never a sequential or otherwise guessable ID.
- Consuming an invite requires the acting User to be authenticated (via OTP) first — an invite proves "you're allowed to join this network," not "you are who you claim to be."
- A used or expired invite must be rejected with a generic error that doesn't reveal whether the code ever existed, was valid, or was already used by someone else (avoid enumeration signal).

## Inventory Mutation & Reservations

- `inventory.adjust` (Stock Movement creation) and reservation endpoints re-check capability and network membership on every call — no caching of "is this user allowed" across requests beyond the session itself.
- Reservation and Stock Movement mutation endpoints accept an idempotency key so a retried request (mobile network flakiness, accidental double-tap) cannot create a duplicate Reservation or duplicate Movement.
- Concurrent reservation correctness is a security-relevant property here (it's what stops one seller from seeing stock another seller has already legitimately taken) — enforced by [ADR-002](../decisions/ADR-002-reservation-concurrency.md), verified by a required concurrent-reservation integration test.

## External Integrations

- `CatalogProvider` responses (if/when Slice 5 ships an enrichment adapter) are untrusted input: validate shape and sanitize before persisting; never render raw provider HTML/text; treat provider-supplied image URLs as untrusted (no automatic hot-linking of unverified sources without at least a domain allowlist).
- `OtpSender` (SMS/WhatsApp) credentials live in environment variables/secrets storage, never in source control, never logged.
- Provider outages must degrade gracefully: a `CatalogProvider` failure must never block manual product creation/editing (explicit non-goal violation otherwise); an `OtpSender` failure must surface a clear, non-leaking error to the user, not a stack trace.

## Data Handling / Logging

- Never log: OTP codes, session tokens, CSRF tokens, full phone numbers (mask if a phone must appear in a log line at all), raw request bodies of authentication endpoints.
- Errors returned to clients never include stack traces, ORM/query text, or provider credentials — map internal errors to a small set of stable, typed application error codes.
- Structured logs should carry a request correlation ID and the resolved `network_id`/`membership_id` (not raw phone number) for failed-auth and failed-authorization events specifically, since those are the events most likely to matter during a real incident review.

## LGPD-Aware Data Minimization (not legal advice)

- Collect only display name + phone number for the MVP profile — no address, no document number, no unnecessary fields.
- Do not replicate phone numbers into logs, analytics events, or third-party services beyond the OTP provider itself.
- A Membership `status = removed` (see domain model) keeps historical Stock Movement/Reservation records intact for audit while removing the User's active access — this is a retention-vs-deletion tradeoff worth documenting if a real deletion request ever needs to be honored; flag to qualified legal review before making a retention/deletion policy claim to users.

## MVP-Blocking vs. Non-Blocking

**Blocking (must exist before Slice 1 ships):** network-scoped queries everywhere, capability checks on every protected route, Owner-exclusive membership/permission management, OTP rate limiting, httpOnly session cookie, CSRF protection, invite token entropy/expiry/single-use.

**Not blocking for Slice 1, but tracked:** idempotency keys on mutation endpoints (needed once reservations ship in Slice 3, not before), full audit log UI (Slice 4+), catalog-provider payload sanitization (only relevant once Slice 5 exists).
