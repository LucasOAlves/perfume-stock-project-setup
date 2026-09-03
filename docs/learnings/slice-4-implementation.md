# Learnings — Slice 4 Implementation (Delegated Permissions)

## Two independent structural blocks against self-escalation, not one

The escalation-safety argument for this slice rests on more than "the route checks `requireOwner`." There are three independent layers, each of which alone would already prevent a seller from escalating:

1. `requireOwner()` (`shared/membership-guard.ts`) is the only authorization check on both the read and write capability-management endpoints — it is a hardcoded `membership.isOwner` check, not a capability lookup, so no combination of granted capabilities can ever satisfy it (verified by a test that grants a seller _every_ real capability and confirms they still get 403 trying to grant themselves one more).
2. The Zod schema (`setCapabilitiesSchema` in `networks.routes.ts`) validates the request body against `z.enum(CAPABILITIES)` — and `CAPABILITIES` (`entities/capability.ts`) structurally excludes `member.manage`/`permission.manage`. A request containing either of those strings is rejected as a 400 before it ever reaches the service layer, let alone the `requireOwner` check.
3. `NetworksService.setMemberCapabilities` re-validates the same list server-side (`CAPABILITIES.includes(c)`), so even a caller bypassing the HTTP schema layer (e.g. a different future entry point into the same service method) hits the same restriction again.

Worth remembering for any future capability-adjacent change: if a new capability is ever added, it goes into the `CAPABILITIES` array — never make `member.manage`/`permission.manage` addressable there, since that would silently reopen the whole class of attack this slice was built to close off (see [ADR-003](../decisions/ADR-003-authorization-model.md)).

## Real browser testing surfaced a real UX bug the tests didn't catch

Manually testing the delegation flow with two actual logged-in users (not just backend integration tests) — an Owner and a newly-invited Seller — found a genuine bug in `StockMovementsPanelComponent`: it loaded the active-reservations list and the movement history in parallel, and both failure paths wrote to the _same_ `errorMessage` signal. When a seller had `inventory.adjust` but not `audit.read`/`reservation.cancel.any`, one 403 silently overwrote the other, and — worse — a component whose fetch threw never populated its list, so it rendered as "Nenhuma movimentação registrada ainda." (no history yet) rather than "you don't have permission to see this." A seller in that state would have no way to tell "there's genuinely no history" from "I'm not allowed to see it," which directly contradicts the UX principle in `.agents/angular-frontend-expert.md`/`docs/architecture/security-model.md` about never implying a false state.

Fixed by giving each background load its own forbidden-vs-empty distinction (`reservationsForbidden`/`historyForbidden` signals, checked via `HttpErrorResponse.status === 403`) instead of a shared error banner. **This is exactly the kind of bug that only surfaces by actually using the app as two different real users in a real browser** — the backend integration tests (which check status codes, not rendered UI state) were already green and gave no signal this existed. Worth treating "log in as two different users in the actual browser" as a required manual verification step for any future slice that introduces a second, differently-privileged actor into the same screen — not just for Slice 4.

## Browser cookie jar is shared across tabs

A related practical note for whoever verifies future slices manually in this same way: opening a second browser tab does **not** give you a second session — cookies are shared per browser profile/origin, so logging in as a different phone number in one tab silently logs out every other tab showing the same origin. Verifying a two-user flow requires explicitly re-logging-in in whichever tab needs to act as which user immediately before that action, not just "one tab per user."

Verified end to end: 41/41 backend tests passing (7 new, all mapped directly to a specific escalation or visibility threat); full two-user browser walkthrough — Owner invites a Seller, grants only `inventory.adjust`, Seller successfully restocks (5→6 on hand) while correctly denied reservation and history visibility, confirming both the grant and the least-privilege boundary work together as designed.
