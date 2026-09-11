# Shared Stock — MVP Vertical Slice Plan

Status: All five slices implemented and verified (Slices 1–4 against real PostgreSQL, Slice 5 additionally against a real live third-party API) — see `docs/learnings/`. Each slice must ship independently useful, demoable value along the primary journey (`docs/product/product-spec.md`). Do not start a slice's implementation without re-reading its acceptance criteria against the domain model and security model first — this plan is the summary, not the full authority.

## Slice 1 — Identity, Sales Network, Membership, Read-Only Manual Inventory ✅ Implemented

**User value:** An Owner can create a network and invite Sellers; every member can see real product availability. This alone already replaces the phone call for the _read_ side of the problem.

**Scope:** Email+OTP auth and session (ADR-004, later ADR-010); Sales Network creation; Owner-issued single-use expiring invite links; invite consumption creates a Membership with default capabilities; manual Product CRUD (Owner/`product.manage` only — Owner-only in Slice 1 since delegation doesn't exist yet); product search/list showing `available_quantity` (= `on_hand_quantity` since no reservations exist yet) to every Membership; basic Owner-only screen to set initial `on_hand_quantity` at product creation (not yet a full movement history — that's Slice 2).

**Out of scope:** Reservations, stock movement history/audit, delegated capabilities, external catalog import.

**Acceptance criteria:** Owner can sign up, create a network, generate an invite, and see it consumed by a Seller who signs up via the link. Seller sees the product list with correct available quantities and cannot see or act on any other network. Product creation/edit is rejected for a non-owner.

**Authorization matrix:** `inventory.read` (all members, default), `product.manage` (Owner only in this slice — capability exists in the model per ADR-003 but is not yet delegable via UI), `member.manage`/`permission.manage` (Owner-exclusive, per ADR-003, though `permission.manage` has no UI yet since there's nothing to grant beyond defaults).

**Migration/data impact:** First migrations — `users`, `sales_networks`, `memberships`, `membership_capabilities`, `invites`, `products`.

**Failure states:** Expired/used invite (generic rejection, no enumeration signal); OTP failure/lockout; product search with no results; empty inventory (new network).

**Test strategy:** API integration tests for tenant isolation (Seller in network A cannot fetch network B's products/invites); OTP rate-limit test; invite single-use test.

**Security risks:** This slice establishes the network-isolation pattern every later slice depends on — get the "resolve Membership from session + path `network_id`" middleware right here, since it will be reused, not re-derived, by every subsequent slice.

## Slice 2 — Owner Stock Mutation + Movement History ✅ Implemented

**User value:** The Owner's stock entries become explainable, not just a mutable number — restocks, corrections, and losses are recorded with a reason.

**Scope:** `StockMovement` creation (RESTOCK, ADJUSTMENT_LOSS, ADJUSTMENT_CORRECTION, RETURN — `SALE_FROM_RESERVATION` and `SALE_DIRECT` wait for Slice 3's reservation lifecycle to be meaningful), Owner-only `inventory.adjust`; movement history view gated by `audit.read` (Owner by default).

**Out of scope:** Reservations, delegation.

**Acceptance criteria:** Every `on_hand_quantity` change has a corresponding movement record with actor/reason/timestamp; a movement that would drive `on_hand_quantity` negative is rejected with a clear conflict, not silently clamped.

**Authorization matrix:** `inventory.adjust` (Owner by default), `audit.read` (Owner by default).

**Migration/data impact:** `stock_movements` table, append-only.

**Failure states:** Attempted negative-stock movement (explicit conflict message); missing/empty reason (validation error).

**Test strategy:** Unit tests on the stock-movement application service invariants; integration test for the negative-stock rejection via the real DB CHECK constraint.

**Security risks:** None new beyond re-confirming `inventory.adjust` is capability-gated, not just Owner-assumed in the UI.

## Slice 3 — Reservations with Concurrency Correctness ✅ Implemented

**User value:** This is the core value proposition — a Seller can reserve a unit and trust it's actually held, and two Sellers racing for the last unit get a correct, honest outcome.

**Scope:** Reservation create/cancel (own reservation) via `reservation.create`/`reservation.cancel.own` (default for all members per ADR-003); reservation lifecycle (`active`/`cancelled`/`expired`/`fulfilled`); `SALE_FROM_RESERVATION` movement type, closing a reservation and decrementing on-hand together in one transaction; reservation expiry (lazy check on read is sufficient for MVP — a background sweep job is a later refinement, not required for correctness since `available_quantity` computation already excludes expired reservations at read time); idempotency key on reservation-mutation endpoints.

**Out of scope:** `reservation.cancel.any` UI beyond the Owner default; delegation of `inventory.adjust`/`product.manage`.

**Acceptance criteria:** All six acceptance-level invariants in `docs/product/product-spec.md` hold, verified by test, especially: two concurrent last-unit reservation requests → exactly one succeeds; cancelling restores availability with no movement created; an Owner adjustment that would go below reserved quantity is rejected with a clear message.

**Authorization matrix:** `reservation.create`, `reservation.cancel.own` (default, all members); `reservation.cancel.any` (Owner by default, not yet delegable).

**Migration/data impact:** `reservations` table; `SALE_FROM_RESERVATION` movement type + nullable `reservation_id` FK on `stock_movements`.

**Failure states:** Reservation exceeding availability (explicit conflict, client should re-fetch and show updated availability, not a generic error); expired-reservation display state; duplicate-tap protected by idempotency key.

**Test strategy:** This slice's test suite is the highest-stakes one in the whole MVP — concurrent-reservation integration test against real Postgres (per ADR-002) is mandatory before this slice is considered done, not optional polish.

**Security risks:** Reservation IDOR (a `reservation_id` from network A must not be cancellable/visible via a network B session) — explicit test required per security model.

## Slice 4 — Delegated Inventory Permission ✅ Implemented

**User value:** The Owner can trust a specific Seller to help manage stock/products without becoming a co-owner, matching real operations where one associate might restock or maintain the catalog.

**Scope:** UI + endpoints for the Owner to grant/revoke `inventory.adjust`, `product.manage`, `reservation.cancel.any`, `audit.read` to specific Memberships (all Owner-exclusive to change, per ADR-003 — `member.manage`/`permission.manage` remain non-delegable).

**Out of scope:** Any change to who can call `permission.manage` itself.

**Acceptance criteria:** A Seller granted `inventory.adjust` can create movements only in that network; revoking the capability immediately blocks further use; no non-owner Membership can call the grant/revoke endpoint under any capability combination.

**Authorization matrix:** `permission.manage` (Owner-exclusive, hardcoded).

**Migration/data impact:** None beyond what Slice 1 already created (`membership_capabilities` was designed for this from the start).

**Failure states:** Attempted self-grant or grant-by-non-owner (rejected, tested explicitly).

**Test strategy:** This is the slice where the security model's privilege-escalation blocking test suite is exercised most directly — treat it as a security review checkpoint, not just a feature.

**Security risks:** The single highest-risk slice for privilege escalation; review before merge, not after.

## Slice 5 — External Catalog Enrichment (Conditional) ✅ Implemented

**User value:** Faster product entry via GTIN/barcode lookup, if it's real enough to trust.

**Status:** Conditional on `docs/research/product-catalog-sources.md`. Findings: no official API exists for the target Brazilian direct-sales brands (Natura, Avon, O Boticário, Eudora) — all classified UNSUITABLE for direct integration. Generic GTIN sources (Cosmos/Bluesoft — paid, data-accuracy disclaimed by the vendor itself; Open Beauty Facts — free but crowdsourced with unverified coverage of these specific products) are recommended only as optional, human-reviewed enrichment, never as an unattended import.

**Scope if pursued:** `CatalogProvider` adapter (behind the interface established in ADR-001/system-design) that looks up a scanned barcode and _pre-fills_ a product-creation form for the Owner to review and confirm — never auto-creates or auto-updates a Product without a human confirming the fields. Manual entry remains fully functional with the adapter absent, disabled, or failing.

**Out of scope:** Any brand-specific integration; any unattended write path from a provider into the product catalog; scraping of any kind.

**Recommendation:** Do not schedule this slice until Slices 1–4 are stable and there's a concrete Owner request for faster entry; even then, treat it as a nice-to-have enrichment, not core value.
