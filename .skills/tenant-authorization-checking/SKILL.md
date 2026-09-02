# Skill: Tenant Authorization Checking

## When to use this

Any time a new backend route or application-service function touches data scoped to a Sales Network (products, reservations, stock movements, invites, memberships, audit records — everything except the `users`/`sessions` tables themselves). This is not optional ceremony: it's the single mechanism that satisfies the project's two blocking security invariants (see `docs/architecture/security-model.md`) — no cross-network access, no privilege escalation.

## The pattern

Implemented once in `apps/api/src/shared/membership-guard.ts`, reused by every module (`identity` doesn't need it; `networks` and `catalog` already use it; `inventory`/`reservations`/`audit` in later slices must too).

1. **Never trust `networkId` from the request.** It's a lookup key, not a credential. Every handler re-derives the caller's actual membership from `request.currentUser.id` (set by `apps/api/src/shared/auth-plugin.ts` from the session cookie) plus the `networkId` path/body param.
2. **Call one of three functions, never hand-roll the check:**
   - `resolveMembership(dataSource, userId, networkId)` — use when the operation just needs "is this an active member of this network" (e.g. read access, viewing member lists). Throws `NotFoundError` if not — the *same* error whether the network doesn't exist or the caller isn't in it, so a client can't distinguish the two by probing IDs.
   - `requireCapability(dataSource, userId, networkId, capability)` — use for any operation gated by a specific grantable capability (`product.manage`, `inventory.adjust`, etc. — see `apps/api/src/modules/networks/entities/capability.ts`). Owners automatically satisfy every capability check.
   - `requireOwner(dataSource, userId, networkId)` — use **only** for `member.manage`/`permission.manage`-class operations. This is intentionally a separate function from `requireCapability` so those two operations can never accidentally become satisfiable by a capability grant (see [ADR-003](../../docs/decisions/ADR-003-authorization-model.md)).
3. **When the operation also targets a specific resource** (a product, a reservation, an invite), scope the resource lookup itself by `networkId` in the same query — `findOne({ where: { id: resourceId, networkId } })`, never `findOne({ where: { id: resourceId } })` followed by a separate ownership check. Fetching by ID alone and checking ownership afterward is the specific bug pattern security review looks for (`.agents/security-reviewer.md`, `.agents/code-reviewer.md`).

## Why this is a Skill and not just "read the code"

This exact reasoning will recur in every remaining MVP slice (reservations, stock movements, delegated permissions, audit) and getting it wrong is exactly the failure class the whole security model exists to prevent — cheaper to state the rule once here than to re-derive it, or worse, silently drift from it, in each new module.

## Testing this pattern

Every new protected route needs at least: (a) a request from a member of a *different* network gets 404, not data; (b) a request from a member lacking the required capability gets 403; (c) a request from the Owner succeeds regardless of explicit capability grants. See `apps/api/test/integration/tenant-isolation.test.ts` and `apps/api/test/integration/invites-and-capabilities.test.ts` for the existing examples to extend, not replace, when adding a new module.
