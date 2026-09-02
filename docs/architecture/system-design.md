# Shared Stock — System Design

Status: draft, post-discovery. Owner: Software Architect agent. See [ADR-001](../decisions/ADR-001-architecture-style.md), [ADR-002](../decisions/ADR-002-reservation-concurrency.md), [ADR-003](../decisions/ADR-003-authorization-model.md), [ADR-004](../decisions/ADR-004-authentication-mechanism.md) for the decisions behind this design.

## Shape

One Angular web app, one Node.js/TypeScript API, one PostgreSQL database. Modular monolith (ADR-001) — no microservices, no message broker, no separate services per module.

```
Angular app (mobile-first)
     │  HTTPS, cookie session
     ▼
Node.js/TypeScript API (single deployable)
 ├─ identity module        (phone+OTP, sessions)
 ├─ networks module        (Sales Network, Membership, Invite)
 ├─ catalog module         (Product)
 ├─ inventory module       (StockMovement)
 ├─ reservations module    (Reservation, concurrency-critical)
 └─ audit module           (read-side over movements/reservations/permission changes)
     │  TypeORM
     ▼
PostgreSQL (single database, migrations-managed)

External, behind interfaces (ADR-001):
 - OtpSender      (SMS / WhatsApp Business API)
 - CatalogProvider (MVP: manual-entry-only implementation; see docs/research/product-catalog-sources.md)
```

## Backend Module Boundaries

Each module: `routes` (HTTP, validation via schema, no business logic) → `application` (services holding use cases, transaction boundaries, capability checks) → `persistence` (TypeORM entities/repositories, scoped to the module's own tables).

Cross-module calls go through a module's application-service functions, never through another module's TypeORM entities directly — this is the enforced boundary that keeps e.g. the reservations module from writing to Product rows except through the inventory/catalog module's own transactional service, which is where the row-lock invariant (ADR-002) lives.

HTTP framework: Fastify + Zod (or an equivalent typed-schema validator) for request/response validation at the route layer. Chosen over Express for built-in schema validation ergonomics; chosen over NestJS because Nest's DI/decorator module system would duplicate the module boundaries already established by folder structure and code review (ADR-001) without adding value at this scale.

## Data / Transaction Strategy

- TypeORM with migrations as the only source of schema truth. `synchronize: true` is forbidden outside throwaway local experiments and must never run against the dev/shared/prod database.
- Naming: snake_case tables/columns, `id` as UUID primary key, `created_at`/`updated_at` timestamps on every table, explicit foreign keys with `ON DELETE RESTRICT` by default (no accidental cascading deletes of stock history).
- Every table that isn't itself `sales_networks` carries an explicit `network_id` foreign key; there is no implicit/derived tenant scoping (e.g. via a join chain) for anything queried directly by a controller.
- Reservation/Product mutations: single transaction, `SELECT ... FOR UPDATE` on the Product row, invariant re-checked in application code before commit (ADR-002). DB CHECK constraints (`on_hand_quantity >= 0`, `reserved_quantity >= 0`, `reserved_quantity <= on_hand_quantity`) are a second line of defense, not the primary mechanism.
- Stock movements are insert-only; no update/delete route exists for `stock_movements` at the API layer.
- No soft deletes by default; introduce only where a specific requirement justifies it (e.g. Membership `status = removed` is a status field, not a soft-delete flag, because a removed Membership's history must remain visible in audit).

## Authorization Enforcement

Every protected route: (1) resolve the authenticated User from the session cookie, (2) resolve their Membership for the `network_id` named in the request path — reject if no active Membership exists, (3) check the specific capability (or `is_owner` for `member.manage`/`permission.manage`) required for that operation, server-side, before touching any data. The `network_id` in a request is a lookup key, never a trust signal (ADR-003, security model).

## Provider Boundary: Product Catalog

`CatalogProvider` interface, MVP implementation is manual-entry-only (no automatic import) per `docs/research/product-catalog-sources.md` — no verified official API exists for the target Brazilian direct-sales brands (Natura, Avon, O Boticário, Eudora), and the available generic GTIN sources (Cosmos/Bluesoft, Open Beauty Facts) are recommended only as optional, human-reviewed enrichment, not an unattended import pipeline. Slice 5 (conditional) would add an enrichment adapter behind this same interface; product creation must keep working with the interface entirely absent.

## Testing Strategy

- Unit tests: application services (reservation lifecycle, stock movement application, capability checks) — the layer where invariants live.
- Integration tests: real PostgreSQL via Docker Compose for repository behavior, DB constraints, and — critically — the concurrent-reservation race (two simultaneous requests for the last unit; exactly one must succeed).
- API integration tests: authorization matrix (every capability × every protected route) and tenant isolation (a Membership in network A must get 403/404, not data, for network B resources).
- Angular: component/service tests for the availability display and reservation flow states (loading/empty/error/conflict), not full coverage of the whole app.
- No full E2E suite in the MVP; one smoke-level end-to-end flow (login → view availability → reserve) is enough, added when Slice 3 stabilizes.

## Local Development

Docker Compose running PostgreSQL only (API and Angular run natively for fast iteration). `.env`-based config. Migrations run explicitly via TypeORM CLI as a setup step, never implicitly on boot in a way that could run against the wrong database.

## What We Are Deliberately Not Building Yet

Microservices, event sourcing/CQRS, Kafka, Kubernetes, a generic repository abstraction layer, interface-per-entity persistence, NgRx, a full E2E suite, multi-location/multi-warehouse support, or an auto-import catalog pipeline. Each is a "revisit when" item in the relevant ADR or plan, not a permanent exclusion.
