# ADR-009 — OTP Delivery Channel: SMS via Twilio, WhatsApp Deferred

## Status

Accepted

## Context

`docs/product/product-spec.md`'s "Open Questions" always flagged this: "OTP delivery channel: SMS vs WhatsApp Business API — cost/deliverability tradeoff, decide during Slice 1 implementation." Slice 1 shipped with `ConsoleOtpSender` (the code prints to the API's own terminal) explicitly as a placeholder — see `apps/api/src/modules/identity/otp-sender.ts` and the progress report's "Bloqueadores de produto para ir ao ar": without a real send path, no one outside the machine running the API can ever log in. This is the single blocker standing between the MVP and a real first user, ahead of any deploy-hosting decision.

The `OtpSender` interface (ADR-004) already isolates this as a swappable boundary — `IdentityService` generates and hashes the code itself and only calls `send(phone, code)`; nothing about auth, rate-limiting, or lockout needs to change for any implementation behind that interface.

## Decision Drivers

- Brazilian resellers (the target users, per `docs/product/product-spec.md`) live in WhatsApp day-to-day far more than SMS — but WhatsApp Business API for a business-initiated message (which an OTP is) requires a Meta Business verification and a pre-approved message template before a single message can send. That's a real operational lift (identity documents, review time measured in days) that has nothing to do with code, and blocks on the user, not on implementation.
- SMS delivery via Twilio's Messages API needs only an account, a phone number, and an API credential — no template approval, no business verification — and reaches any phone number, not only WhatsApp users.
- Twilio also offers a "Verify" product that generates and checks the code itself, but adopting it would mean ripping out the code generation/hashing/rate-limiting already built and tested in `IdentityService` (`docs/learnings/slice-1-implementation.md` documents the real OTP-lockout bug that logic already caught and fixed) — not worth it just to save one HTTP call.
- Whatever ships first must not block on external approval processes I cannot complete on the user's behalf (a Twilio/Meta account, a real business, payment details — all of that is the account owner's to set up, never something to be done automatically).

## Options Considered

1. **WhatsApp Business API (via Twilio or Meta directly) as the first real channel.** Rejected for now — template pre-approval and Business verification are real, multi-day, human-in-the-loop steps outside this codebase; shipping this first would leave the "no one outside localhost can log in" blocker open for as long as that approval takes.
2. **Twilio Verify (provider-generated codes).** Rejected — would replace, not reuse, `IdentityService`'s existing code generation, hashing, and rate-limiting, which already has real test coverage and a fixed real bug behind it.
3. **Twilio Messages API (SMS), our own code, our own hashing/rate-limiting — send is the only thing that changes.** Chosen.

## Decision

**`TwilioOtpSender`** (`apps/api/src/modules/identity/otp-sender.ts`), implementing the existing `OtpSender` interface with a plain `fetch` call against Twilio's REST API (Basic Auth with Account SID + Auth Token) — no Twilio SDK dependency, matching the "no dependency for one endpoint" choice already made for `OpenBeautyFactsCatalogProvider` (ADR-005). Selected via `OTP_SENDER=twilio` plus `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER`, validated at app startup (`defaultOtpSender()` in `apps/api/src/app.ts`) — a missing credential fails loudly when the server boots, not silently on the first user's login attempt. `OTP_SENDER=console` (the existing dev sender) stays the default; nothing about local development changes.

A send failure (network error, non-2xx from Twilio) throws the new `ExternalServiceError` (502) — the OTP challenge row is already persisted by the time `send()` is called, so the user can just request a new code; nothing about the existing rate-limiting or lockout logic changes.

WhatsApp is explicitly deferred, not rejected — see "Revisit When."

## Consequences

- The MVP's most-cited go-live blocker (per the progress report) is resolved: any phone number, not just ones reachable from the machine running the API, can complete OTP login.
- Actually sending a message still requires the account owner to create a Twilio account, buy/verify a sending number, and place a real credential in `apps/api/.env` — none of which this change can do on its own. Until that's done, `OTP_SENDER` stays `console` and behavior is unchanged.
- SMS costs money per message (Twilio, pay-per-send) from the first real OTP sent — unlike the free `ConsoleOtpSender` and the free-tier `OpenBeautyFactsCatalogProvider`. This is a real, ongoing operational cost, not a one-time setup cost.

## Tradeoffs

Gained: a send path any Owner/Seller can actually receive, shippable without waiting on a business-verification process. Given up: the channel target users actually prefer day-to-day (WhatsApp), and a small ongoing per-message cost that `ConsoleOtpSender` never had.

## Security/Operational Impact

Twilio credentials are real secrets — `TWILIO_AUTH_TOKEN` must never be committed (already covered by `.gitignore` per ADR-007) and belongs in the same "secrets vault for production" gap the progress report already flags under the Deploy track, not in the CI workflow (see ADR-008 — no production secrets exist there today). Twilio's own error responses are never forwarded to the client or logged verbatim — they can echo back the destination phone number — matching `docs/architecture/security-model.md` "Data Handling / Logging."

## Revisit When

Once there's a verified Twilio/Meta WhatsApp Business sender with an approved OTP template, add a `WhatsAppOtpSender` behind the same `OtpSender` interface and let `OTP_SENDER=whatsapp` select it — same pattern as this one, not a redesign. Also revisit if SMS deliverability or cost to Brazilian numbers specifically turns out worse than expected once real usage data exists.
