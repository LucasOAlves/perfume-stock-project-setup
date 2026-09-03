# ADR-003 — Authorization Model: Capability List per Membership, Owner-Exclusive Membership/Permission Management

## Status

Accepted

## Context

The master prompt explicitly forbids reducing authorization to a single global `isAdmin` boolean and requires network-membership-scoped, capability-based authorization, checked server-side on every protected operation.

## Decision Drivers

- Capabilities that must be independently grantable (`inventory.adjust`, `product.manage`, `reservation.cancel.any`, `audit.read`) do not map cleanly onto a small fixed set of roles — an Owner may want to trust one seller with stock adjustment but not member management, and a different seller with neither.
- The single most dangerous failure mode is privilege escalation: a Membership granting itself or another Membership more capabilities than the Owner intended.
- The model must stay simple enough for a non-technical Owner to understand in plain UI language ("can this person change stock counts?") without exposing RBAC vocabulary.

## Options Considered

1. **Fixed roles** (e.g. `owner`, `manager`, `seller`), each implying a hardcoded capability set.
2. **Capability list per Membership** — a `membership_capabilities` join table; `is_owner` is a separate first-class flag, not a capability, and always implies every capability plus exclusive rights to `member.manage`/`permission.manage`.
3. **Full policy engine** (e.g. attribute-based rules, external policy service) — rejected immediately as disproportionate to MVP scope; noted only to record it was considered.

## Decision

**Option 2 — capability list per Membership**, with `is_owner` kept structurally separate from the capability list rather than being just another capability.

- `member.manage` and `permission.manage` are hardcoded to require `is_owner = true` — they are **not** grantable capabilities in the MVP. This closes off the entire class of "a sufficiently capable seller grants themselves more capabilities" attacks by construction: no code path checks a capability to decide whether a Membership can change capabilities.
- All other capabilities (`inventory.read`, `reservation.create`, `reservation.cancel.own`, `reservation.cancel.any`, `inventory.adjust`, `product.manage`, `audit.read`) are independently grantable rows in `membership_capabilities`.
- Default grants for a new non-owner Membership: `inventory.read`, `reservation.create`, `reservation.cancel.own`. Everything else must be explicitly granted by the Owner (least privilege by default, per master prompt).
- Every protected backend operation re-derives the caller's Membership (and its capabilities) from the authenticated session plus the `network_id` in the request — the `network_id` itself is never trusted as proof of authorization, only as a lookup key validated against the caller's own memberships.

## Consequences

- Adding a new capability is an additive migration (new enum value / new row type), not a schema change to a role table.
- The Owner-exclusive carve-out for membership/permission management is a hardcoded rule, not data-driven — this is intentional (see Decision) and must not be "simplified" into a regular capability in a later slice without a new ADR, since that would reopen the self-escalation risk.
- UI copy can present capabilities as plain-language toggles ("can change stock counts") without ever surfacing the word "role" or "capability" to the Owner.

## Tradeoffs

Gained: fine-grained, auditable, hard-to-escalate authorization. Given up: the simplicity of "three roles, done" — judged worth it given the master prompt's explicit rejection of a single admin boolean and the product's core trust requirement.

## Security/Operational Impact

Directly implements the master prompt's non-negotiable invariant: "a seller must never be able to grant themselves permissions." Security review (`.agents/security-reviewer.md`) should specifically test that no `permission.manage`-adjacent endpoint accepts anything but `is_owner = true`.

## Revisit When

A network legitimately needs more than one Owner (co-ownership), which would require redesigning `is_owner` from a boolean into its own delegable capability with a different escalation-safety argument — do not do this without a new ADR.
