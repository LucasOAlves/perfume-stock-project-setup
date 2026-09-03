# Product Catalog Data Sources — Research Report

**Prepared by:** Catalog Researcher (agent)
**Date:** 2026-09-01
**Scope:** Legitimate, real product-data sources to enrich a manual perfume/cosmetics catalog (name, brand, SKU, barcode/GTIN, category, image) for the Shared Stock project (Brazilian direct-sales resellers — _revenda de perfumes_).

**Method:** Live web search and fetches against public web pages (search engine results plus direct fetch of provider pages) performed on 2026-09-01. No API keys were obtained and no authenticated calls were made — all findings are based on publicly readable documentation/marketing pages. Where documentation was not reachable or not found, this is stated explicitly as "unverified." Nothing below is fabricated; if a detail (price, limit, field, license) could not be confirmed from a real source, it is marked unverified rather than guessed.

---

## 1. Brand-Specific Sources (Natura, Avon, O Boticário, Eudora, Jequiti)

### 1.1 Natura (incl. Avon, since Avon is now part of Natura &Co / owned by Natura)

**Classification:** UNKNOWN / UNSUITABLE (no public catalog API found)

**Evidence:**

- Natura's official consultant channels are the "Rede Natura" web store and consultant apps — consumer/reseller-facing web properties, not documented developer APIs. (natura.com.br)
- A Sensedia (API management vendor) case-study/press piece describes Natura investing in an internal "composable business" / API-management platform after the Avon acquisition, to integrate internal systems (HR, logistics, supply, consultant onboarding across Natura/Avon) — this is B2B/internal enterprise integration infrastructure, not a published third-party developer catalog API. (sensedia.com.br, infomoney.com.br)
- No developer portal, API documentation, terms of use for third-party catalog access, or public GTIN/product endpoint was found for Natura or Avon Brasil.

**Data Available:** Unverified — no public schema exists to evaluate.

**Constraints:** None documented because there is no public program; any access would require a formal B2B/partnership agreement with Natura (unconfirmed whether such a program even exists for small independent resellers).

**Reliability:** N/A — nothing to depend on.

**Cost:** Unverified/likely not applicable to individual resellers.

**Risks:** Any attempt to pull catalog data from Natura/Avon's consultant portal or app (which requires reseller login) would mean scraping an authenticated, ToS-governed consumer property — this is explicitly out of scope and not recommended (see Safety section).

**Recommendation:** Do not build an integration against Natura/Avon today. If the project wants brand-accurate Natura/Avon data, the only legitimate path is to contact Natura &Co / Avon Brasil directly and ask about a formal data-partnership or B2B API program; until confirmed, treat as unavailable.

**Confidence:** High (confidence that no public program exists, based on absence of any developer portal in search results and vendor case studies describing only internal integration).

---

### 1.2 O Boticário (Grupo Boticário — also owns Eudora, Quem Disse Berenice?, O.U.i)

**Classification:** UNSUITABLE (no public catalog API found)

**Evidence:**

- Official reseller support page (boticario.com.br/atendimento-online/revendedora) and the "Revendedores Grupo Boticário" mobile app (Apple App Store listing) describe a reseller portal/app with a printed catalog, online store, and inventory/order tracking — consumer/reseller-facing tools, not a documented developer API.
- The unified Grupo Boticário reseller registration explicitly covers O Boticário, Quem Disse Berenice?, O.U.i and **Eudora** under one account — confirming Eudora is part of the same closed reseller ecosystem, with the same lack of public API.
- No developer documentation, terms of API use, or GTIN/product endpoint was found.

**Data Available:** Unverified.

**Constraints:** Access to the reseller catalog/app requires an authenticated reseller account; no public reuse terms exist because there is no public API.

**Reliability:** N/A.

**Cost:** Unverified.

**Risks:** Scraping the authenticated reseller app/portal would violate its terms of use (consumer app, not an open data source) and is not recommended.

**Recommendation:** Do not build an integration against O Boticário/Eudora today. Contact Grupo Boticário directly to ask about a formal data/API partnership if brand-accurate data is required; treat as unavailable until confirmed.

**Confidence:** High (same reasoning as Natura — no developer portal found across multiple targeted searches).

---

### 1.3 Jequiti

**Classification:** UNSUITABLE (no public catalog API found)

**Evidence:**

- Jequiti publishes only consumer-facing digital/print catalogs (institucional.jequiti.com.br/catalogo, catalogo.jequiti.com.br — a "digital live catalog" for browsing/ordering) and consultant-locator tools. No developer portal or API documentation was found.

**Data Available:** Unverified.

**Constraints/Reliability/Cost:** N/A — no public program exists.

**Risks:** The digital catalog is a rendered consumer web app; scraping it would face the same ToS/legal ambiguity flagged for other brands and is not recommended as a default approach.

**Recommendation:** Do not integrate. Contact Jequiti directly if brand-accurate data is required.

**Confidence:** High.

---

### 1.4 Summary for Brand-Specific Direct-Sales Sources

None of Natura, Avon Brasil, O Boticário, Eudora, or Jequiti publish a documented, public, third-party-facing catalog/product API. All of these companies' digital surfaces for product data are consumer- or reseller-authenticated web/app properties governed by their own consumer terms of use, not open data platforms. This is a consistent, well-evidenced pattern across all four groups researched (Grupo Boticário, Natura &Co/Avon, Jequiti), not a gap in this research pass — repeated targeted searches for "API," "desenvolvedores," "parceiros," and "integração" for each brand returned no developer documentation.

**Practical implication:** any product data your project holds for these brands (name, SKU, category, image) will have to come from manual entry, from generic barcode/GTIN lookup services (Section 2), or from a future formal partnership with the brand — not from a live brand API today.

---

## 2. Generic GTIN / Barcode Lookup Sources (fallback/enrichment path)

### 2.1 Cosmos (Bluesoft) — `api.cosmos.bluesoft.com.br`

**Classification:** THIRD-PARTY API (commercial, documented, requires paid plan for real use)

**Evidence:**

- Official product/pricing pages: `https://cosmos.bluesoft.com.br/api-pricings` and `https://api.cosmos.bluesoft.com.br/api` (Bluesoft is the provider/owner; this is their own product, "Cosmos – Catálogo de Produtos, GTIN, NCM, Tributação e Marca").
- Documented endpoints include `GET /gtins/{código}` (product by GTIN/EAN), `GET /products?query=` (search by description or GTIN), `GET /gpcs/{código}`, `GET /ncms/{código}/products`, `GET /products/by_date`.
- Authentication: `X-Cosmos-Token` header plus a User-Agent, confirmed from the official API documentation page.

**Data Available:** Product description, GTIN, image URL, category, NCM (Brazilian tax classification code), brand, dimensions, weight, and price references. This is a general Brazilian retail product database (used widely by Brazilian POS/ERP systems), not perfume-specific, but it does include personal-care/cosmetics/perfume SKUs sold in the Brazilian market as part of its general coverage — **perfume/cosmetics-specific coverage completeness is unverified** (no category-level coverage statistics were published).

**Constraints:**

- Pricing tiers found on the official pricing page (2026 snapshot): Basic = free, 25 queries/day; Simple = R$499.99/month, 100 queries/day; Standard = R$999.99/month, 200 queries/day; Pro = R$1,999.99/month, 500 queries/day; Enterprise = custom. ("Query" = one lookup call.)
- The provider explicitly disclaims data accuracy/completeness/currency and states data "should be reviewed before use" — some products may be missing NCM or image.
- Full terms of use / reuse rights for the free tier, and specific image-licensing terms, were **not found on the pages fetched** — unverified. Before using Cosmos images/data in a shared multi-tenant catalog, the project should obtain Cosmos's terms of service directly from Bluesoft (not found in this search pass).

**Reliability:** Commercial product with defined pricing tiers and versioned documentation — suggests an actively maintained service, but no published uptime/SLA was found (unverified).

**Cost:** Free tier is very limited (25 lookups/day) — likely insufficient for anything beyond prototyping. Paid tiers start at ~R$500/month, a real ongoing cost for a project.

**Risks:** Data-accuracy disclaimer means Cosmos data should be treated as "candidate" data requiring human review before being trusted in the catalog, not authoritative. Cost scales with usage; a shared community catalog with many lookups could get expensive quickly under this per-query-per-day model.

**Recommendation:** Good candidate as an _optional, paid, opt-in enrichment step_ (e.g., "look up by barcode to prefill a draft product") rather than the backbone of the catalog. Use the free tier only for prototyping/manual spot lookups; do not architect the product around needing hundreds of automated queries/day unless budget is confirmed. Always let the reseller/admin review and confirm Cosmos-sourced data before it's trusted as canonical.

**Confidence:** Medium-High (documentation and pricing pages exist and were fetched directly from the vendor; full ToS/licensing text was not located, which limits confidence on the legal/reuse side).

---

### 2.2 Open Food Facts / Open Beauty Facts (`world.openbeautyfacts.org`)

**Classification:** OFFICIAL SUPPORTED API (non-profit, open-data project; "official" for its own database, not for any brand)

**Evidence:**

- Official data/API page: `https://world.openbeautyfacts.org/data`. Open Beauty Facts is the cosmetics/personal-care sibling project of Open Food Facts, run by the Open Food Facts non-profit/community (openfoodfacts.github.io documentation explicitly covers Open Beauty Facts as sharing ~98% of the same API).
- REST/JSON API confirmed, e.g. `GET https://world.openbeautyfacts.org/api/v3/product/{barcode}.json`.
- Full data exports available (MongoDB dumps, JSONL, Parquet via Hugging Face, CSV) as an alternative to the live API.

**Data Available:** Barcode/EAN, product name, brand, category tags, ingredients, and (per the project's general model) user-contributed product photos. Coverage is **crowdsourced** — completeness for any specific product (especially Brazilian direct-sales perfumes) is not guaranteed and was not separately verified; Open Beauty Facts is a much younger, smaller dataset than Open Food Facts and its own documentation notes it is still "work in progress."

**Constraints:**

- Licensing (confirmed from the official data page): database structure under the **Open Database License (ODbL)**, record contents under the **Database Contents License**, and **images under Creative Commons Attribution-ShareAlike (CC BY-SA)** — though the page notes images "may contain copyrighted elements" (e.g., brand packaging/logos), so reuse still carries some residual risk despite the CC BY-SA framing.
- Explicit policy: "1 API call = 1 real scan by a user" — the project discourages using the live API for bulk/automated scraping-style traffic; bulk use should go through the official data exports instead.
- No hard rate limit number is published; the API team asks for a descriptive User-Agent/contact header so they can reach out if there's an issue.

**Reliability:** Established open-source/non-profit project (same family as Open Food Facts, which has years of production use); Open Beauty Facts itself is smaller/newer and its docs admit gaps.

**Cost:** Free.

**Risks:** Brazilian, direct-sales-specific perfume coverage is very likely sparse (this is a global crowdsourced database skewed toward retail-shelf products with scannable barcodes in supermarkets/pharmacies, not closed reseller catalogs) — **unverified but a reasonable expectation to flag**, since these brands' items aren't typically found on open retail shelves with public barcodes. Treat as a low-hit-rate fallback rather than a primary source for this project's target brands.

**Recommendation:** Good candidate as a _free, low-risk, optional enrichment lookup_ by GTIN/EAN, with proper attribution and respecting the "1 call = 1 scan" policy (i.e., trigger it only when a real user scans/enters a barcode, not for bulk pre-population). Expect a low match rate for Natura/Avon/Boticário/Jequiti products specifically; still worth wiring up because it's free and legitimate.

**Confidence:** High on licensing/API mechanics (official page fetched directly); Low-Medium on actual coverage for the target brands (unverified, no product-level testing performed).

---

### 2.3 Brasil API (`brasilapi.com.br`)

**Classification:** UNSUITABLE (for this use case — no product/GTIN endpoint exists)

**Evidence:**

- Brasil API is a real, open-source, community-maintained Brazilian public API aggregator (CEP, CNPJ, bank list, FIPE table, exchange rates, DDD area codes, national holidays, etc.), confirmed via its own site and multiple third-party integration docs (Make.com, freepublicapis.com, hexdocs).
- No product catalog / GTIN / EAN / barcode endpoint was found in its documented endpoint list.

**Data Available:** Not applicable — does not offer product data.

**Recommendation:** Not usable for catalog enrichment. Useful elsewhere in the project (e.g., CNPJ/CEP validation for reseller onboarding) but out of scope for product catalog data. Included here only to close off a source explicitly named in the research brief.

**Confidence:** High (its full endpoint list is public and does not include product/GTIN lookup).

---

### 2.4 UPCitemdb (`upcitemdb.com` / `devs.upcitemdb.com`)

**Classification:** THIRD-PARTY API (commercial, US-centric)

**Evidence:**

- Official docs confirm a free "Explorer" tier (100 combined lookup+search requests/day, 6 requests/minute burst limit, up to 2 UPCs per batch request) and paid tiers (Dev: 20,000 lookups/day; Pro: 150,000 lookups/day), per `upcitemdb.com/wp/docs/main/development/api-rate-limits/` and `.../plan/`.

**Data Available:** Product title, brand, images, category, and (per its name) primarily **UPC** codes — UPC is the North American barcode standard; EAN/GTIN-13 (the standard used in Brazil) support is **unverified** from the pages fetched.

**Constraints:** Free tier requires no signup but is rate-limited; paid tiers start around $49/month per third-party comparison pages (unverified directly from UPCitemdb's own pricing page in this pass — sourced from a secondary aggregator, so treat the exact price as low-confidence).

**Reliability:** Established commercial product with clear tiered plan documentation.

**Cost:** Free tier very limited; paid tiers are a real recurring cost.

**Risks:** Its database is heavily weighted toward US/North American retail products. **Brazil-market and EAN coverage is unverified and likely weak** — this was not confirmed with an actual lookup test in this research pass, but the product's branding, plan documentation, and marketing all center on "UPC," not the EAN/GTIN-13 codes typical of Brazilian products.

**Recommendation:** Low priority for this project. Cosmos and Open Beauty Facts are both more directly relevant to the Brazilian/EAN context; only consider UPCitemdb if a specific gap in EAN coverage needs a secondary opinion, and confirm EAN/GTIN-13 support directly with the provider before relying on it.

**Confidence:** Medium on mechanics (official docs fetched); Low on Brazil/EAN applicability (unverified).

---

### 2.5 GS1 Brasil — Cadastro Nacional de Produtos (CNP) / GS1 Brasil API Portal

**Classification:** OFFICIAL SUPPORTED API — but **membership-gated**, not open/public

**Evidence:**

- `gs1br.org` and `blog.gs1br.org` confirm GS1 Brasil (the Brazilian chapter of the global GS1 barcode/GTIN standards body) operates the "Cadastro Nacional de Produtos" (CNP), the authoritative Brazilian registry where **brand owners** register their own GTINs/products.
- Access to the CNP portal/API is free **but requires GS1 Brasil membership** (an association + annual-fee model); GS1 Brasil is described as a long-running (~40-year) association with 58,000+ members.
- A dedicated API portal exists (`portalapi.gs1br.org` / `apicnp.gs1br.org`) referencing "GTIN, GLN and Cadastro de Produtos" integration, but the portal's substantive documentation (auth flow, endpoints, whether read access is available to non-member data consumers) could not be loaded/confirmed in this research pass (page returned only a title/loading state) — **unverified**.

**Data Available (where documented elsewhere):** Brand, product description, classification (GPC), destination market, CEST/NCM tax codes, gross weight, photo URL, and GTIN hierarchy — this is the most authoritative possible source for Brazilian GTIN data, since it's the actual registry brand owners use to create their GTINs.

**Constraints:** This system is built for **brand owners registering their own products**, not for third-party consumers looking up arbitrary products. Whether GS1 Brasil offers any public/consumer-facing _read_ API (as opposed to the write/registration side for members) is **unverified** from what could be fetched — GS1 Brasil should be contacted directly to clarify if a read-only lookup API exists and what it costs/requires.

**Reliability:** Very high in principle (this is the canonical numbering authority) but access model is unconfirmed for this project's use case.

**Cost:** Unverified for a read/lookup use case; membership fees exist for brand owners registering products (amounts not published in the pages reached).

**Risks:** Likely not accessible or cost-effective for an independent reseller-catalog project unless GS1 Brasil confirms a public lookup tier exists.

**Recommendation:** Worth a direct inquiry to GS1 Brasil (atendimento@gs1br.org) to clarify whether a public/low-cost GTIN lookup API exists distinct from the member product-registration system, before assuming it's usable. Do not build against it without that confirmation.

**Confidence:** Medium (the registry and its purpose are well-documented; the specific API-for-lookups question is unresolved).

---

## 3. Comparison Table

| Source               | Classification                                   | Brazil Coverage                            | Perfume/Cosmetics Coverage                 | Auth Required               | Cost                                                                             | GTIN/SKU Support                            | Image Reuse Rights                                 | Production Suitability                                     | Confidence                               |
| -------------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| Natura / Avon Brasil | UNSUITABLE                                       | N/A (no public API)                        | N/A                                        | N/A                         | N/A                                                                              | N/A                                         | N/A                                                | Not usable                                                 | High                                     |
| O Boticário / Eudora | UNSUITABLE                                       | N/A (no public API)                        | N/A                                        | N/A                         | N/A                                                                              | N/A                                         | N/A                                                | Not usable                                                 | High                                     |
| Jequiti              | UNSUITABLE                                       | N/A (no public API)                        | N/A                                        | N/A                         | N/A                                                                              | N/A                                         | N/A                                                | Not usable                                                 | High                                     |
| Cosmos (Bluesoft)    | THIRD-PARTY API                                  | Yes (Brazilian product DB)                 | Present but completeness unverified        | Yes (`X-Cosmos-Token`)      | Free tier very limited; paid from ~R$500/mo                                      | Yes (GTIN-based lookup)                     | Unverified (ToS not located)                       | Conditional — good as opt-in paid enrichment, not backbone | Medium-High                              |
| Open Beauty Facts    | OFFICIAL SUPPORTED API (of its own open dataset) | Unverified, likely sparse for these brands | Unverified, likely sparse for these brands | No                          | Free                                                                             | Yes (barcode-based)                         | CC BY-SA (images may contain copyrighted elements) | Good free fallback, low expected hit rate                  | High (mechanics) / Low-Medium (coverage) |
| Brasil API           | UNSUITABLE (no product endpoint)                 | N/A                                        | N/A                                        | No                          | Free                                                                             | No                                          | N/A                                                | Not usable for catalog                                     | High                                     |
| UPCitemdb            | THIRD-PARTY API                                  | Unverified, likely weak (US-centric)       | Unverified                                 | No (free tier)              | Free tier limited; paid from reported ~$49/mo (secondary source, low confidence) | UPC-focused; EAN/GTIN-13 support unverified | Unverified                                         | Low priority                                               | Medium (mechanics) / Low (Brazil fit)    |
| GS1 Brasil CNP       | OFFICIAL SUPPORTED API (membership-gated)        | Yes — authoritative registry               | Yes (if member-registered)                 | Yes (GS1 Brasil membership) | Unverified for lookup use case                                                   | Yes — canonical GTIN source                 | Unverified                                         | Needs direct confirmation before use                       | Medium                                   |

---

## 4. Overall Recommendation

1. **No brand (Natura, Avon, O Boticário, Eudora, Jequiti) offers a public catalog API today.** This was checked directly and repeatedly; all of their digital product-data surfaces are closed, authenticated, consumer/reseller apps and portals governed by their own consumer terms of use. Building against them would require either (a) a formal partnership/agreement obtained directly from the brand, which is unconfirmed to exist for small resellers, or (b) scraping an authenticated consumer property, which this research explicitly does not recommend due to ToS and legal ambiguity.

2. **Generic GTIN/barcode services are viable only as optional, opt-in enrichment, not as the catalog's foundation:**
   - **Cosmos (Bluesoft)** is the most Brazil-relevant paid option, with real documented endpoints and GTIN-keyed lookup, but has a very limited free tier, a real ongoing cost at scale, and an explicit vendor disclaimer that data should be reviewed before use.
   - **Open Beauty Facts** is free and legitimately licensed (ODbL/CC BY-SA) but is a crowdsourced global database whose actual coverage of Brazilian direct-sales perfume SKUs is unverified and likely thin — worth wiring up as a zero-cost "try this barcode" lookup, with low expectations.
   - **Brasil API** does not offer product data at all and should not be pursued for this purpose.
   - **UPCitemdb** is US/UPC-centric with unverified EAN/Brazil fit — low priority.
   - **GS1 Brasil's CNP** is the most authoritative registry in principle but is built for brand owners registering GTINs, not third-party lookups; whether a public read/lookup tier exists needs direct confirmation from GS1 Brasil before any integration work is planned.

3. **Manual product entry remains the safe, recommended MVP path regardless of the above.** None of the researched sources offers a free, well-documented, high-coverage, low-risk API specifically for Natura/Avon/O Boticário/Eudora/Jequiti products. The project should treat any of these external sources (Cosmos, Open Beauty Facts) purely as an _optional convenience_ — e.g., "scan a barcode to try to prefill a draft entry, then a human confirms/edits it" — never as an unattended, automatic source of truth. Given the disclaimed accuracy of Cosmos data and the sparse/unverified coverage of Open Beauty Facts for these specific brands, manual entry (by the reseller, from the product itself or the brand's own printed/official catalog) is and should remain the primary, reliable way products enter the shared catalog.

---

## 5. Notes on Method and Limitations

- This research was performed via web search and unauthenticated page fetches only; no API keys were requested or used, and no live API calls were made against Cosmos, Open Beauty Facts, UPCitemdb, or GS1 Brasil endpoints (only their public documentation/marketing pages were read).
- Several pages could not be fully loaded (client-rendered JS apps returning "Loading..." for automated fetches, notably GS1 Brasil's API portal and a direct fetch of `api.cosmos.bluesoft.com.br/api` which returned HTTP 403). Where this occurred, the report marks the relevant details "unverified" rather than inferring them.
- Coverage claims about how many _Natura/Avon/Boticário/Jequiti-specific_ products actually exist in Cosmos or Open Beauty Facts were not empirically tested (no live lookups were performed) and are flagged as unverified expectations, not measured facts.
- Pricing and rate-limit figures reflect what was published on provider pages at the time of this research (2026-09-01) and should be reconfirmed directly with each provider before any commercial commitment, since these commonly change.
