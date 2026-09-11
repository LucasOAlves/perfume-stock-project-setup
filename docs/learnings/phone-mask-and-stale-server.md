# Learnings — Phone Mask and a Stale Dev Server Incident

**Note (post-ADR-010):** the identifier changed from phone to email — `phone-format.ts`, `PHONE_REGIONS`, and the masked phone input described in "Phone input" below no longer exist in the codebase. Kept as historical record of the reasoning (hand-rolled vs. library) and the stale-dev-server incident, both still valid lessons; don't look for the actual files it describes.

## Incident: the user saw an already-fixed English error message

After translating every backend error message (see `docs/learnings/naming-theming-i18n.md`), the user still saw the old English "Phone must be in E.164 format..." message in a screenshot. Cause: `tsx watch` (the `dev:api` process) had gotten stuck failing to restart — `/tmp/api.log`-equivalent showed repeated `EADDRINUSE: address already in use 0.0.0.0:3000` on every subsequent file save. What happened: an earlier restart left an old server process still bound to port 3000 (from a previous manual kill/restart cycle in this session), and every later `tsx watch` reload attempt failed to rebind, silently leaving the **stale, pre-translation process** as the one actually answering requests — while the terminal kept scrolling past what looked like normal rebuild activity.

**Fix**: kill whatever process actually holds port 3000 (`Get-NetTCPConnection -LocalPort 3000 -State Listen`) and start `dev:api` fresh, then verify with a live request (`curl` a known-changed endpoint) rather than assuming the watcher's log output means the change is live.

**Lesson**: `tsx watch`'s "Rerunning..." log line does not mean the new code is serving traffic — an `EADDRINUSE` failure right after it is easy to miss in a long log, and the old process keeps silently answering requests with old code indefinitely. When behavior doesn't match a just-made source change, check for `EADDRINUSE` in the dev server log and confirm the port's actual owning process before assuming the bug is in the code.

## Phone input: hand-rolled mask, not a library

Evaluated (architect hat, per the user's request) ngx-mask vs. a hand-rolled formatter for the one masked field in the whole app (phone number on the login screen). Decided against ngx-mask: it's a real, well-maintained library, but adding a runtime dependency for exactly one input contradicts this project's established bias against unnecessary dependencies (no NgRx, no UI kit — see `.agents/angular-frontend-expert.md`). A ~20-line formatter (`apps/web/src/app/core/phone-format.ts`) covers the actual need: live-format raw digits as `(11) 99999-9999` (11-digit mobile) or `(11) 9999-9999` (10-digit landline) while typing, with no library.

**Scope change**: the country/DDI is no longer part of the free-text phone field. Per the user's request ("+55 não é necessário nesse momento, todos os telefones serão brasileiros" — but modeled as a selectable field for future regions), the login form now has a `<select>` region picker (`PHONE_REGIONS` — currently just Brazil, `+55`) preselected and disabled-by-having-one-option, plus a phone field that only accepts local digits. The E.164 string sent to the API is assembled client-side (`selectedDialCode + phoneDigits`) — the backend's E.164 validation (`PHONE_PATTERN` in `identity.service.ts`) is unchanged and still the source of truth; the frontend change only affects how the user builds that string, not what the server accepts.

**Adding a second country later**: add an entry to `PHONE_REGIONS` in `phone-format.ts` and, if its number format differs from Brazil's, branch `formatBrazilPhone` (rename to something region-aware) on the selected region — the form itself doesn't need to change.

## Demo data cleanup

The already-logged-in test account's `display_name` was `"Seller"` (created before the "Vendedor" default fallback fix — see `naming-theming-i18n.md`) and kept showing up in screenshots. Fixed by directly updating that one row in the dev database (`UPDATE users SET display_name = 'Ana' WHERE display_name = 'Seller'`) — this is dev/demo data cleanup, not a product feature; there's still no "edit my profile" UI for a real user to fix their own display name themselves, which would be a real future feature if this ever becomes a genuine gap (nothing currently indicates it's needed for the MVP).

Verified end to end: 44/44 backend tests still passing; manual browser walkthrough of the new region-select + masked-phone login flow, live OTP request/verify succeeding with the assembled E.164 number.
