# Learnings — Slice 2 Implementation (Stock Mutation + Movement History)

## Incident: integration tests wiped the manually-created dev/demo data

`test/integration/setup.ts` resolved its database as `process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL` — with no `TEST_DATABASE_URL` set, it silently fell back to the same database `apps/api/.env`'s `DATABASE_URL` pointed at, i.e. the dev database. Running `vitest run` (as part of verifying Slice 2) called `resetDatabase()` (`TRUNCATE ... RESTART IDENTITY CASCADE` on every app table) against that database, deleting a network, product, and user created moments earlier through the browser UI for manual verification.

**Fixed**: created a separate `shared_stock_test` database, migrated it, and set `TEST_DATABASE_URL` in `apps/api/.env` (and documented the requirement in `apps/api/.env.example`) to point at it. `npm run migration:run` only applies to `DATABASE_URL` — remember to also apply migrations to whatever `TEST_DATABASE_URL` points at whenever a new migration is added (`DATABASE_URL=<test-db-url> npx typeorm-ts-node-commonjs migration:run -d src/config/data-source.ts` from `apps/api/`, overriding the env var for that one command).

**General lesson**: never let a test suite's database default silently coincide with the dev database's default. If this repo's `.env.example` or setup instructions ever change to drop `TEST_DATABASE_URL`, this exact incident will recur — treat `TEST_DATABASE_URL` as load-bearing, not optional.

## Slice 2 build notes

- Stock movements reuse the same row-lock mechanism as reservations will in Slice 3 ([ADR-002](../decisions/ADR-002-reservation-concurrency.md)) — `SELECT ... FOR UPDATE` on the `Product` row inside a transaction, invariant re-checked in application code, DB `CHECK` constraints as the second line of defense. This was a deliberate consequence of the domain model calling stock movements and reservations "the two writers of `on_hand_quantity`" — worth remembering when Slice 3 adds the second writer for real, since both now share the exact same lock point on the same row and will correctly serialize against each other automatically.
- `quantity_delta` is signed and its sign is validated per movement `type` (`RESTOCK`/`RETURN` must be positive, `ADJUSTMENT_LOSS` must be negative, `ADJUSTMENT_CORRECTION` may be either) — this validation lives in `InventoryService`, not in the DB, because the DB can't easily express "sign depends on a sibling column's value" without a more complex constraint; the DB only enforces the type-independent invariants (`quantity_delta <> 0`, and the existing non-negative/`reserved <= on_hand` checks on `products`).
- Frontend: kept the stock-adjustment/history UI as its own component (`stock-movements-panel.component.ts`) rather than folding it into the product edit form, because it's gated by different capabilities (`inventory.adjust`/`audit.read` vs `product.manage`) — this separation will matter once Slice 4 lets an Owner delegate one without the other.

Verified end to end: 23/23 tests passing (7 new) against the real, isolated test database; manual browser walkthrough (create product → record a RESTOCK movement → quantities and history update live) against the real dev database.
