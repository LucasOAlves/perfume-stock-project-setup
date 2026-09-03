# ADR-005 — Catalog Enrichment Provider: Open Beauty Facts, Opt-In, Suggestion-Only

## Status

Accepted

## Context

`docs/research/product-catalog-sources.md` found no official API for any of the target Brazilian direct-sales brands (Natura, Avon, O Boticário, Eudora) — all classified UNSUITABLE for direct integration. Two generic GTIN sources were evaluated as fallback enrichment: Cosmos/Bluesoft (paid, vendor explicitly disclaims data accuracy, free tier capped at 25 queries/day) and Open Beauty Facts (free, official API, ODbL-licensed crowdsourced database, coverage of these specific SKUs unverified and likely sparse). `docs/plans/mvp.md` Slice 5 scoped this as conditional, suggestion-only enrichment for the product-creation form — never an unattended write path — and recommended not scheduling it until Slices 1–4 were stable.

## Decision Drivers

- No cost/API-key requirement should be needed to demonstrate the feature working end to end in this MVP.
- The provider must sit behind the `CatalogProvider` interface established in ADR-001/system-design, with manual entry unaffected by its absence or failure.
- Given known-sparse coverage for these specific products, the feature's value is "sometimes saves typing," not "reliable enrichment" — the implementation must not overstate confidence in what it returns.

## Options Considered

1. **Cosmos/Bluesoft** — real, documented, but paid (free tier is 25 queries/day) and the vendor itself disclaims data accuracy. Requires an API key/credential to demonstrate at all.
2. **Open Beauty Facts** — free, official API, no credential required, real documented terms (ODbL database license, usage policy asks for a descriptive User-Agent and discourages bulk scraping).
3. **No provider (manual entry only)** — always available regardless of the other two; this is what ships when `CATALOG_PROVIDER` is unset.

## Decision

**Open Beauty Facts**, wired behind the existing `CatalogProvider` interface, **disabled by default** (`CATALOG_PROVIDER=none`) and opt-in via an environment variable (`CATALOG_PROVIDER=openbeautyfacts`). Cosmos is not implemented — it's a real, documented option worth adding later if a network's Owner has a Cosmos API key and wants better coverage, but there's no reason to build and maintain a second adapter for an MVP feature whose own research report says coverage of these specific products is unverified either way.

Implementation constraints (`apps/api/src/modules/catalog/catalog-provider.ts`):

- One lookup call per explicit user action (a barcode entered into the create-product form), never a batch or background job — matches Open Beauty Facts' stated usage policy.
- A 5-second timeout and a broad try/catch around the network call — any failure (timeout, 4xx/5xx, malformed JSON) returns `null`, never throws, so a provider outage can never block manual product creation.
- Response fields are sanitized before being returned to the client: text fields are stripped of control characters and length-capped; the image URL is parsed and only ever returned if its protocol is `https:`. Nothing from the provider response is trusted or passed through unsanitized (`docs/architecture/security-model.md` "External Integrations").
- The endpoint (`GET /networks/:id/catalog-lookup`) requires `product.manage` — it's only meaningful as an aid to someone who can already create/edit products — and never writes to the database itself; it returns a suggestion the Owner must review and submit through the normal product create/update call.

## Consequences

- Real, verifiable functionality ships without requiring a paid API key or credential to demonstrate.
- Suggestion quality for these specific Brazilian direct-sales products is expected to be low/inconsistent (crowdsourced, global database, not focused on this market segment) — the UI must not present a "found" result as authoritative, only as a pre-fill to review.
- If a network wants better coverage via Cosmos later, that's a new adapter behind the same interface plus a per-network API-key setting — not a redesign.

## Tradeoffs

Gained: zero-cost, zero-credential, real external integration demonstrating the provider-boundary pattern end to end. Given up: any meaningful improvement in product-entry speed for the actual target brands, which the research phase already flagged as unlikely regardless of provider choice.

## Security/Operational Impact

Outbound HTTP call to a third-party domain triggered by an authenticated, capability-checked user action; no credentials sent; response sanitized before reaching the client or ever being persisted. Covered by `docs/architecture/security-model.md` "External Integrations."

## Revisit When

A network Owner has a real, funded Cosmos/Bluesoft account and wants materially better coverage — add a second adapter behind `CatalogProvider`, selected the same way (`CATALOG_PROVIDER=cosmos` plus a network-level or environment-level API key), not by replacing this one.
