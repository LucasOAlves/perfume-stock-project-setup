# Shared Stock — Domain Model

Status: draft, post-discovery. Owner: Inventory Domain Expert agent. This is the source of truth for inventory/reservation semantics — implementation must match this, not the other way around. If implementation forces a change here, update this file and the relevant ADR before merging.

## Ubiquitous Language

- **Sales Network** — the tenant boundary. One Owner's shared physical stock plus the sellers associated with it. All Products, Reservations, Movements and Memberships belong to exactly one Sales Network.
- **Membership** — the link between a User and a Sales Network. Carries `is_owner` and a set of granted Capabilities. A User may hold multiple Memberships (multiple networks) but each Membership is independent.
- **Owner** — the Membership with `is_owner = true`. Exactly one per network for the MVP (the creator). Always implicitly holds every Capability. Only an Owner may call `member.manage` or `permission.manage`.
- **Associated Seller** — any non-owner Membership.
- **Product** — a network-scoped catalog + stock entry: identity fields (name, brand, SKU, barcode/GTIN, category, image, active flag) plus the current stock numbers (`on_hand_quantity`, `reserved_quantity`).
- **On-hand quantity** — the physical count of ready-to-deliver units the Owner actually has. Changed only by Stock Movements.
- **Reserved quantity** — the sum of currently-active Reservations' quantities for that Product. Changed only by Reservation lifecycle transitions.
- **Available quantity** — `on_hand_quantity - reserved_quantity`. Always computed, never stored. This is the number sellers actually care about.
- **Reservation** — a Seller's time-bounded hold on a quantity of a Product, reducing displayed availability without touching physical stock.
- **Stock Movement** — an immutable, append-only record of a change to `on_hand_quantity`: who, when, how much, what type, optional note.
- **Capability** — a single named permission a Membership can hold (e.g. `inventory.adjust`). Not a role; a Membership can hold any subset.

## Entities

### SalesNetwork

`id, name, created_by (user), created_at`

### Membership

`id, network_id, user_id, is_owner (bool), status (active|removed), created_at`
Unique on `(network_id, user_id)`.

### MembershipCapability

`membership_id, capability (enum)` — join table, not a bitmask, so new capabilities are additive migrations, not a format change.

### Product

`id, network_id, name, brand, sku, barcode (nullable), category (nullable), image_url (nullable), is_active, on_hand_quantity, reserved_quantity, created_at, updated_at`
Constraints: `on_hand_quantity >= 0`, `reserved_quantity >= 0`, `reserved_quantity <= on_hand_quantity`.

### Reservation

`id, network_id, product_id, created_by (membership), quantity, status (active|fulfilled|cancelled|expired), expires_at, created_at, updated_at`
Constraint: `quantity > 0`.

### StockMovement

`id, network_id, product_id, type (RESTOCK|ADJUSTMENT_LOSS|ADJUSTMENT_CORRECTION|SALE_DIRECT|SALE_FROM_RESERVATION|RETURN), quantity_delta, reason (text, required), created_by (membership), reservation_id (nullable, set only for SALE_FROM_RESERVATION), created_at`
Append-only: no update/delete endpoint. Corrections are new movements, not edits.

### Invite

`id, network_id, code (high-entropy token), created_by, expires_at, used_at (nullable), used_by (nullable)`
Single-use, network-scoped, expiring — never a guessable/sequential ID (see security model).

## Invariants

1. `available_quantity = on_hand_quantity - reserved_quantity`, always `>= 0`. Enforced at the DB level via `reserved_quantity <= on_hand_quantity` plus non-negativity checks, and re-verified in the application transaction before every mutation.
2. Reservations never mutate `on_hand_quantity` directly. Only Stock Movements do.
3. `on_hand_quantity` decreases only through a Stock Movement. A `SALE_FROM_RESERVATION` movement is the _only_ type allowed to simultaneously close a Reservation (fulfilled) and decrease `on_hand_quantity`/`reserved_quantity` together, in one transaction.
4. Negative on-hand or negative available is never permitted; a movement that would violate this is rejected as a conflict, not silently clamped to zero.
5. A Reservation cannot be created for more than the currently available quantity, evaluated inside the same transaction that locks the Product row (no read-then-write gap).
6. Reservations are not required to consume all remaining availability — partial reservations are valid.
7. Cancelling or expiring a Reservation restores availability immediately and creates no Stock Movement (nothing physical changed).
8. Every Product, Reservation, Movement, Membership and Invite carries an explicit `network_id`; no query may span networks implicitly.
9. Only the Owner Membership may grant/revoke Capabilities or manage Memberships (`member.manage`, `permission.manage` are Owner-exclusive, not just capability-gated, so no Membership — however capable — can ever escalate itself or another Membership).

## Reservation State Machine

```
active --(cancelled by creator or member.cancel.any holder)--> cancelled
active --(expires_at reached, lazily observed or swept)--> expired
active --(fulfilled via SALE_FROM_RESERVATION movement)--> fulfilled
```

`cancelled`, `expired`, `fulfilled` are terminal. No transitions out.

## Concurrency Scenarios (see [ADR-002](../decisions/ADR-002-reservation-concurrency.md) for the chosen mechanism)

- **Two sellers reserve the last unit simultaneously.** Both transactions attempt `SELECT ... FOR UPDATE` on the Product row; the second waits, re-reads `available_quantity` after acquiring the lock, and fails with a domain conflict if it's now insufficient. Exactly one succeeds.
- **Owner adjusts stock below currently reserved quantity.** The DB constraint `reserved_quantity <= on_hand_quantity` rejects the movement inside the same transaction; the application surfaces a clear conflict ("N units are reserved; cancel reservations before reducing stock below that") rather than silently overriding reservations. No auto-cancellation in the MVP.
- **Concurrent Stock Movement and Reservation on the same Product.** Both acquire the same row lock, so they serialize; no interleaving that could produce a transient negative-available state is possible.
- **Duplicate reservation request from a flaky mobile connection (retry).** Client mutation calls carry an idempotency key; a retried request with the same key returns the original result instead of creating a second reservation.

## Permission-Sensitive Operations

| Operation                                 | Required Capability      | Notes                                     |
| ----------------------------------------- | ------------------------ | ----------------------------------------- |
| View products / availability              | `inventory.read`         | Default for every Membership.             |
| Create a reservation                      | `reservation.create`     | Default for every Membership in MVP.      |
| Cancel own reservation                    | `reservation.cancel.own` | Default for every Membership.             |
| Cancel another member's reservation       | `reservation.cancel.any` | Owner by default; grantable.              |
| Record a Stock Movement (change on-hand)  | `inventory.adjust`       | Owner by default; grantable from Slice 4. |
| Create/edit/deactivate a Product          | `product.manage`         | Owner by default; grantable from Slice 4. |
| Invite/remove a Member                    | `member.manage`          | Owner-exclusive, non-delegatable in MVP.  |
| Grant/revoke Capabilities                 | `permission.manage`      | Owner-exclusive, non-delegatable in MVP.  |
| View Stock Movement / reservation history | `audit.read`             | Owner by default; grantable.              |

## Open Domain Decisions

- Reservation default TTL — **resolved for MVP**: 24h, hardcoded (`DEFAULT_RESERVATION_TTL_MS` in `apps/api/src/modules/reservations/reservations.service.ts`), not yet configurable per network. Revisit if real usage data suggests a different default is needed.
- Reservation expiry mechanism — **resolved for MVP**: no background job; swept lazily inside any transaction that already locks the affected product's row (reservation create/cancel, stock movement, reservation fulfillment). See `docs/learnings/slice-3-implementation.md` for the accepted staleness limitation this implies for the plain product-list read path.
- Whether `reservation.create` can be disabled network-wide (e.g. during a physical recount) — no evidence of need yet, defer.
- Whether Products should ever be shared/cloned across a User's multiple networks — explicitly rejected for MVP (see product-spec "Simplification: no separate Stock Item entity").
