# ADR-002 — Reservation Concurrency: Pessimistic Row Locking

## Status

Accepted

## Context

Two Associated Sellers can attempt to reserve the last unit of a Product at the same moment. This is a core domain race condition (see `docs/product/domain-model.md`), not an edge case, and correctness here is the single highest-trust requirement in the product: an oversold reservation directly recreates the "double promise" problem the product exists to prevent.

## Decision Drivers

- Must make over-reservation structurally impossible, not merely unlikely.
- Must remain understandable and testable by a small team (QA explicitly requires a concurrent-reservation integration test against real PostgreSQL).
- Contention is expected to be low-to-moderate (small seller networks, not flash-sale volumes), so raw throughput under heavy contention is not a driving concern.
- Must produce a predictable, explicit conflict response the client can show as "someone else just took it" rather than a generic error.

## Options Considered

1. **Optimistic concurrency (version column + retry).** Read `available_quantity` and a `version`, write with `WHERE version = :version`, retry or fail on mismatch.
2. **Atomic conditional UPDATE** (`UPDATE products SET reserved_quantity = reserved_quantity + :qty WHERE id = :id AND on_hand_quantity - reserved_quantity >= :qty`), checking rows-affected.
3. **Transaction + row-level lock** (`SELECT ... FOR UPDATE` on the Product row, then re-check `available_quantity` in application code, then insert the Reservation and update `reserved_quantity` in the same transaction).

## Decision

**Option 3 — transaction + `SELECT ... FOR UPDATE` row lock**, backed by the DB CHECK constraints in the domain model (`reserved_quantity <= on_hand_quantity`, non-negativity) as a second line of defense.

Reasoning: Option 2 (atomic conditional UPDATE) is nearly equivalent and was seriously considered — it is slightly cheaper (no explicit lock held across a round trip) — but it only protects the single `UPDATE` statement. Because reservation creation also inserts a `Reservation` row and stock movement fulfillment needs to touch both `Reservation` and `Product` together, we need a transaction with a held lock anyway; once that's true, the explicit `SELECT ... FOR UPDATE` is more readable and keeps the invariant check (in application code, in one place) next to the write, rather than encoded only inside a `WHERE` clause that every future mutation must remember to replicate correctly. Option 1 (optimistic) is rejected as the primary mechanism: under real contention for the same last unit, optimistic retries thrash and either need client-visible retry loops or silent server retries, both worse for a small, easy-to-reason-about MVP than a short, low-contention lock wait.

All reservation-affecting operations (`reservation.create`, `reservation.cancel`, reservation expiry sweep, and stock-movement application) acquire the same Product row lock inside one transaction, so they serialize against each other by construction.

## Consequences

- Every mutation touching a Product's stock numbers must go through the application service that opens the transaction and takes the lock — no code path may update `on_hand_quantity`/`reserved_quantity` outside it. This is enforced by code review (see `.agents/code-reviewer.md`'s explicit "read-then-write reservation race" and "missing transaction boundaries" checks), not by the type system.
- Lock hold time must stay short (no external calls — e.g. no SMS/notification send — inside the locked transaction).
- Under pathological contention (many sellers hammering one Product) requests will queue briefly rather than fail; acceptable at this scale, revisit if evidence of real contention appears.

## Tradeoffs

Gained: a single, auditable mechanism that's easy to explain and to test. Given up: some throughput ceiling under heavy contention, judged acceptable for the target scale.

## Security/Operational Impact

None beyond correctness — this is what prevents the trust-breaking failure mode (two sellers both believing they hold the last unit).

## Revisit When

Real production evidence shows lock contention causing meaningful latency (would need per-Product concurrent-write volume far beyond a small reseller network), or the reservation model changes to support batched/bulk reservations across many Products in one request.
