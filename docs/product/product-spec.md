# Shared Stock — Product Spec

Status: draft, post-discovery. Owner: Product Manager agent. Revisit whenever MVP scope is challenged.

## Product Naming

**User-facing product name: "Estoque Vivo"** ("live/current stock"). The target users are Brazilian resellers running the app entirely in Portuguese, and the product's whole value proposition is that the availability shown is *live* — not a stale number someone has to double-check by phone. "Estoque Vivo" says that in the name itself: plain language (no RBAC/ERP jargon, matches the terminology rules below), and it directly encodes the core product outcome from "Core Product Outcome" above. Chosen over more literal options ("Estoque Compartilhado" — accurate but reads as a bureaucratic label, doesn't carry the trust/liveness promise) and over brand-first options disconnected from the domain ("Giro Certo" — catchy but about turnover, not about the specific "is this real right now" problem this product solves).

**"Shared Stock" remains the internal engineering codename** — repo name, npm package names (`@shared-stock/api`), database names (`shared_stock`), and every doc under `docs/`, `.agents/`, and `MASTER_PROMPT.md`. It never appears anywhere a real user can see it (`apps/web/src/index.html`'s `<title>`, the app header brand, and every user-facing string are "Estoque Vivo" / Portuguese). Splitting these deliberately avoids a large, low-value rename across the whole engineering surface (repo folder name, package.json names, database names, every ADR reference) for a decision that only needs to be visible in the product itself. Revisit only if the engineering codename genuinely starts causing confusion (e.g. onboarding a new contributor who only ever sees the app).

## Target Users

1. **Network Owner** — holds the physical ready-to-deliver inventory (typically the primary reseller). Creates the Sales Network, invites Associated Sellers, controls capabilities, is the default (but not only, once delegated) actor for stock mutation.
2. **Associated Seller** — sells remotely from the Owner's shared stock. Needs trustworthy availability to promise products to their own customers. Can create/cancel their own reservations. May be granted additional capabilities (stock mutation, product management) by the Owner.

Both are non-technical, mobile-first users. Neither is a "system administrator" — avoid RBAC/ERP vocabulary in the UI.

## Core User Problem

An Associated Seller cannot reliably know whether a ready-to-deliver item is still available without calling/messaging the Owner. This causes repeated interruptions, stale information, double-promising the same unit to two customers, and erodes trust in the Owner's stock.

## Job to Be Done

*"When a customer asks if I can deliver a product now, I want to check trustworthy shared availability myself, so I can promise it confidently without contacting the stock owner."*

## Product Outcome

Success = an Associated Seller can answer **"Can I promise this product to my customer right now?"** by looking at the app, and that answer is correct often enough to fully replace a phone call. This requires the displayed availability to reflect physical stock, active reservations, and recent mutations — never a stale or optimistic guess.

## Primary Journey (validated, kept from initial proposal)

Owner creates account → creates a Sales Network → invites Associated Sellers (invite link/code) → registers products manually → records ready-stock quantity → Seller opens shared inventory → searches a product → sees available quantity → optionally reserves quantity → Owner (or a delegated Seller) records stock changes → availability recalculates consistently for everyone.

Any feature that does not serve this path is out of Slice 1 by default.

## MVP Scope (Slice 1 candidates — see `docs/plans/mvp.md` for the full slice breakdown)

- Minimal profile: display name + phone number only.
- Phone + OTP authentication (see [ADR-004](../decisions/ADR-004-authentication-mechanism.md)).
- Sales Network creation, owner-issued invite links (single-use, expiring, network-scoped).
- Manual product catalog (name, brand, SKU, barcode/GTIN optional, category, image URL optional, active/inactive).
- Product search/list showing available quantity to every member.
- Reservation create/cancel by any member, scoped to their own reservations.
- Owner-only stock mutation (movements) with required reason, in Slice 2.
- Reservation concurrency correctness from Slice 3 (see [ADR-002](../decisions/ADR-002-reservation-concurrency.md)).
- Delegated `inventory.adjust` / `product.manage` capabilities from Slice 4 — **not** in Slice 1, to keep the initial authorization surface small and reviewable.

## Explicit Non-Goals (confirmed)

Checkout, customer CRM, invoicing/fiscal documents, payment processing, delivery logistics, marketplace/discovery across networks, multi-warehouse logistics, purchase-order automation, forecasting, loyalty, social features, microservices/event sourcing/Kafka/Kubernetes. External catalog auto-import is conditional on catalog research (`docs/research/product-catalog-sources.md`); manual entry must always work regardless of that outcome.

## Terminology Decisions

| Term | Decision | Why |
|---|---|---|
| Sales Network | Kept | Matches how resellers already describe "minha rede" (their downline of sellers around one stock). Rejected "branch/matrix" per master prompt — implies a franchise hierarchy this product doesn't have. |
| Owner | Kept over "Administrator" | "Owner" maps to "this is my physical stock," which is the real-world relationship; "Administrator" reads as a software role, not a business identity. |
| Associated Seller / Seller | Kept | Plain language, no RBAC jargon. |
| Product | Kept, network-scoped | See domain model — a Product row *is* the stock record for that network (no separate "Stock Item" concept; see Simplifications below). |
| Reservation | Kept | Clear to sellers already; matches "reservar" in everyday use. |
| Stock Movement | Kept | Append-only ledger entry; not shown to sellers as "movement," shown in owner-facing history as "stock change." |
| Capability | Used internally instead of "Permission" | "Permission" is fine in UI copy; internally we model discrete capabilities, not a single role flag — see [ADR-003](../decisions/ADR-003-authorization-model.md). |

## Simplification: no separate "Stock Item" entity

Each `Product` belongs to exactly one Sales Network (no cross-network shared catalog in the MVP) and carries its own `on_hand_quantity` / `reserved_quantity` directly. A separate "Stock Item" joining Product↔Network would only add value if products were ever shared across networks or across physical locations — neither is true for this MVP (one Owner, one physical location, one network per product). Revisit only if multi-location or shared-catalog-across-networks becomes a real requirement.

## Acceptance-Level Product Invariants

1. Available quantity shown to a Seller is always correct as of the last committed mutation — never an eventually-consistent estimate.
2. A Seller never sees or can act on a Sales Network they are not a member of.
3. Only members holding the relevant capability can mutate stock, manage products, manage members, or manage permissions.
4. Two sellers racing for the last unit: exactly one reservation succeeds.
5. Cancelling or expiring a reservation immediately restores availability.
6. Every change to on-hand quantity is attributable (who, when, how much, why).

## Open Questions (not blocking Slice 1, revisit before Slice 2–4)

- Default reservation TTL before auto-expiry (proposal: 24h, configurable per network later — not MVP).
- Whether an Owner should be able to disable `reservation.create` network-wide (e.g., during a stock recount) — deferred, not evidence of demand yet.
- OTP delivery channel: SMS vs WhatsApp Business API — cost/deliverability tradeoff, decide during Slice 1 implementation, not a product-scope question.
