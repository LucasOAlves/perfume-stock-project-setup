# Object Storage Providers for Product Images — Research Report

**Prepared by:** Research agent
**Date:** 2026-09-01
**Scope:** S3-compatible (or S3-API-compatible) object storage providers for storing and serving product photos for Estoque Vivo — a shared inventory / stock app for Brazilian perfume and cosmetics resellers (backend: Node.js/Fastify/TypeORM/PostgreSQL; frontend: Angular). Currently there is no real image upload in the product; there is only an optional image URL field. **This document is planning/research only — nothing described here has been implemented.**

**Method:** Live web search and fetches against official provider pricing/documentation pages, performed on 2026-09-01. No accounts were created and no authenticated API calls were made. Where a page did not clearly surface a number (e.g., AWS's pricing page renders pricing tables in JS that a text-only fetch could not read in full), this is stated explicitly and the figure is cross-checked against multiple independent secondary sources (marked accordingly) rather than invented. Prices shown are USD unless noted, reflect what was published at research time, and should be reconfirmed on the provider's own pricing page before any commercial commitment, since cloud storage pricing changes fairly often.

---

## 1. AWS S3

**Classification:** Native S3 (the reference implementation — everything else is "S3-compatible" relative to this).

**Storage cost:** S3 Standard is **$0.023/GB-month** for the first 50 TB/month in `us-east-1` (N. Virginia), stepping down slightly at higher volume tiers ($0.022/GB for the next 450 TB, $0.021/GB beyond 500 TB). The São Paulo region (`sa-east-1`) is confirmed by multiple secondary sources to be **among AWS's most expensive regions**, i.e., meaningfully above the `us-east-1` rate — the exact `sa-east-1` per-GB figure could not be extracted from AWS's own JS-rendered pricing page in this pass and should be checked on the [AWS Pricing Calculator](https://calculator.aws/) before committing; treat "higher than $0.023/GB" as confirmed, exact number as **unverified**.

**Egress cost:** First 100 GB/month free (aggregated across all AWS services/regions, globally). Beyond that: roughly $0.09/GB for the next ~10 TB, tapering down at higher volume tiers (~$0.085, ~$0.07, ~$0.05/GB at successive tiers, per secondary aggregator sources — AWS's own page confirms the tiered structure and the 100 GB free allotment but the exact tier breakpoints were sourced from secondary pages, so treat exact tier cutoffs as **medium-confidence**). This is the classic "S3 is cheap to store, expensive to serve" pricing shape.

**Request costs:** Yes — PUT/COPY/POST/LIST and GET/SELECT requests are billed per 1,000 requests (typically fractions of a cent each), on top of storage and egress. Exact current per-1,000 figures were not clearly extracted from the rendered pricing page in this pass — **unverified**, but this cost is non-zero and adds up under high read volume (e.g., many sellers repeatedly loading thumbnail grids).

**Free tier:** AWS Free Tier includes a limited allotment of S3 storage/requests for new accounts for a bounded period (historically 12 months) — exact current terms not re-verified in this pass; do not rely on it as a durable production-cost baseline.

**S3-API compatibility:** This _is_ the S3 API — full compatibility by definition. Any S3-compatible SDK (AWS SDK, MinIO client, `@aws-sdk/client-s3`, etc.) works unmodified.

**CDN / image transformation:** None built into S3 itself. AWS commonly pairs S3 with CloudFront (CDN) and/or Lambda@Edge / a separate image-resizing service for on-the-fly thumbnails — this is extra integration work and extra cost, not a single-product offering.

**Brazil region/latency:** AWS has a real São Paulo region (`sa-east-1`), so both storage and low-latency serving to Brazilian users are natively possible without a third-party CDN — a genuine advantage for Brazil-based traffic. The trade-off is that `sa-east-1` pricing is a premium over US regions (see above).

**Notable gotchas:** Egress pricing is the single biggest cost risk for a read-heavy image workload (many sellers repeatedly opening the same product photos). Billing is genuinely complex (storage class, request class, region, transfer type all interact), which makes cost forecasting harder for a small team. No zero-config CDN/image-resize story.

**Confidence:** High on general pricing shape and the existence/relative-cost-premium of `sa-east-1`; Medium on some exact tier/request numbers (pricing page was not fully machine-readable in this pass).

---

## 2. Cloudflare R2

**Classification:** S3-API-compatible object storage, built by Cloudflare, explicitly designed around **zero egress fees**.

**Storage cost:** Standard storage class: **$0.015/GB-month** (about 35% cheaper than AWS S3 Standard on storage alone). An Infrequent Access class also exists at **$0.01/GB-month** but carries a 30-day minimum storage duration and a $0.01/GB retrieval fee — not relevant for actively-served product photos, which should use Standard.

**Egress cost:** **$0.00/GB — no egress fee at any volume**, for both Standard and Infrequent Access classes, confirmed on Cloudflare's own pricing page. This is R2's headline differentiator and directly addresses the "many sellers repeatedly viewing the same images" access pattern this project has.

**Request costs:** Yes, but modeled as "operations," not per-GB transfer: **Class A (writes/lists, e.g., PUT/POST/LIST)** = $4.50 per million requests; **Class B (reads, e.g., GET/HEAD)** = $0.36 per million requests (Standard tier rates; Infrequent Access rates are roughly double). For a catalog with a modest number of uploads and repeated but not enormous read volume, this cost is very low in absolute terms.

**Free tier:** 10 GB-month of Standard storage, 1 million Class A operations/month, 10 million Class B operations/month, and (implicitly) free egress, resetting every month, with no time limit on the free tier itself (unlike AWS's 12-month new-account free tier). For a small number of network Owners each uploading dozens-to-low-hundreds of images, 10 GB is a meaningful amount of headroom (thousands of compressed JPEGs).

**S3-API compatibility:** Yes — R2 implements the S3 API directly; existing S3 SDKs (including AWS's own SDK) work by pointing them at R2's endpoint and account-specific credentials. Confirmed on Cloudflare's own R2 S3-compatibility docs.

**CDN / image transformation:** R2 objects can be served through Cloudflare's global CDN/edge network. Actual on-the-fly resizing/format conversion is a **separate product**, Cloudflare Image Transformations (formerly "Image Resizing"), which can operate on images stored in R2 (or S3, or your own origin) without needing to move them into Cloudflare's dedicated "Images" product. Pricing found: **first 5,000 unique transformations/month free, then $0.50 per 1,000 unique transformations** (billed once per 30 days per unique transform request, not per view — cached repeat views of an already-transformed image are not re-billed). This is a real, usable path to serving properly-sized mobile thumbnails without hand-rolling a resize pipeline, and it composes with R2's zero egress.

**Brazil region/latency:** R2 doesn't expose traditional "regions" the way AWS does — bucket data placement uses "location hints" and Cloudflare's storage backend, but _serving_ happens through Cloudflare's edge network, which has Points of Presence in Brazil as part of Cloudflare's 100+-country, 275+-city network (confirmed generally; exact Brazil PoP count not itemized in the pages fetched). In practice this means read latency for Brazilian sellers should be good via Cloudflare's edge/cache even though the bucket's primary storage location is not a Brazil-specific "region" in the AWS sense — a reasonable expectation but **not independently latency-tested** in this research pass.

**Notable gotchas:** Younger product than S3 (GA since 2022) — smaller ecosystem/tooling maturity than AWS, though S3-API compatibility mitigates lock-in risk substantially. Class A (write) operations are pricier per-unit than Class B (read), which is a good fit for this project's pattern (uploads are rare, views are frequent). Image Transformations is billed separately from R2 itself, so total cost = storage + operations + transformations if resizing is used.

**Confidence:** High — all core numbers came directly from Cloudflare's own pricing/documentation pages.

---

## 3. Backblaze B2

**Classification:** S3-API-compatible object storage (in addition to its own native B2 API), historically known for very low storage prices.

**Storage cost:** **$6.95/TB-month** ≈ **$0.0068/GB-month** — roughly 3x cheaper than AWS S3 Standard, and slightly less cheap than R2's $0.015/GB rate is expensive (i.e., B2 is cheaper than R2 on raw storage). A higher-throughput "B2 Overdrive" tier exists at $15/TB-month for large-scale workloads — not relevant at this project's scale.

**Egress cost:** Not simply zero, but effectively very low/free for typical usage: Backblaze gives **free downloads up to 3x your average monthly stored volume**; beyond that, overage is **$0.01/GB**. Additionally, **Backblaze offers unlimited free egress when traffic is routed through Bandwidth Alliance CDN partners (Cloudflare, Fastly, bunny.net)** — meaning if a bunny.net or Cloudflare CDN is put in front of B2, egress can be $0 regardless of volume. For a catalog of dozens-to-low-hundreds of images per network viewed repeatedly by that network's sellers, actual monthly egress volume is very likely to stay under the "3x stored volume" free threshold even without a CDN.

**Request costs:** Backblaze's "Class A, B, C" transactions (bucket/list/head-type operations) are **free**; only "Class D" transactions (a smaller category) cost **$0.004 per 10,000 calls**, with the first 2,500/day free. This is negligible for this project's scale.

**Free tier:** First **10 GB of storage is always free** (not time-limited), a genuinely durable free allotment for a small MVP.

**S3-API compatibility:** Yes — Backblaze B2 has a documented S3-Compatible API (endpoints at `*.backblazeb2.com` rather than `amazonaws.com`), confirmed via Backblaze's own docs. Caveat: it supports only Signature Version 4 (not v2), and has limited ACL support versus AWS — generally fine for a straightforward upload/serve use case, but worth knowing if any tooling depends on v2 signing or advanced ACLs. Buckets created before May 2020 are not S3-compatible; new buckets are fine.

**CDN / image transformation:** No built-in resizing/format-conversion product. CDN is achieved by pairing B2 with a Bandwidth Alliance partner CDN (Cloudflare, Fastly, bunny.net), which — as noted above — also has the side benefit of making egress free. This requires separate setup (a CDN in front of the bucket) rather than being a single integrated product.

**Brazil region/latency:** Backblaze's own data centers are in the US (Sacramento, Stockton, Phoenix, Reston), EU (Amsterdam), and Canada (Toronto) — **no Brazil/South America data center**. Latency directly to a B2 endpoint from Brazil would cross a continent; this gap is exactly why pairing with a CDN (which does have Brazilian PoPs) matters for this provider specifically, not just for cost.

**Notable gotchas:** No native South America presence — a CDN in front of B2 is close to mandatory for acceptable latency to Brazilian sellers, not just an egress-cost optimization. This adds one more moving part (CDN configuration) versus a provider with built-in edge delivery.

**Confidence:** High — figures came directly from Backblaze's own pricing and documentation pages.

---

## 4. DigitalOcean Spaces

**Classification:** S3-API-compatible object storage, bundled with a CDN, sold as a flat monthly subscription rather than granular pay-per-GB from dollar one.

**Storage cost:** Base subscription is **$5.00/month**, which *includes* 250 GiB of storage; additional storage beyond that is **$0.02/GiB-month**. There's also a separate "Spaces Cold Storage" archival tier at $0.007/GiB-month (with retrieval fees) — not relevant for actively-served product photos.

**Egress cost:** The $5/month base subscription also includes **1,024 GiB (1 TB) of outbound transfer/month** (covering both CDN and direct-origin bandwidth); overage beyond that is **$0.01/GiB**. Inbound bandwidth is always free.

**Request costs:** No separate per-request (PUT/GET) pricing was found on DigitalOcean's pricing page — requests appear to be included in the flat subscription, which simplifies cost forecasting versus AWS's separate request-class billing.

**Free tier:** No standing free tier for Spaces itself; DigitalOcean periodically offers new-account credit ($100–$200 for 60 days is a common historical promo) but that is time-limited trial credit, not a permanent free allotment — **treat as unverified/promotional, not a durable free tier**.

**S3-API compatibility:** Yes — Spaces is explicitly marketed and documented as S3-compatible object storage; standard S3 SDKs work by pointing at a DigitalOcean endpoint.

**CDN / image transformation:** A CDN is **included at no additional cost** as part of the base subscription (the included bandwidth allowance covers both CDN and origin transfer) — genuinely convenient, no separate CDN product/bill to manage. However, there is **no built-in image resizing/format-conversion feature** — Spaces is storage + CDN delivery only; generating differently-sized thumbnails would still require app-side processing (e.g., resizing at upload time and storing multiple sizes) or a separate image-processing service.

**Brazil region/latency:** DigitalOcean Spaces is available in datacenters across North America (NYC, SFO, TOR, ATL, RIC), Europe (AMS, LON, FRA), and Asia-Pacific (SGP, BLR, SYD) — **no South America / Brazil region**. The nearest region to Brazil is likely Toronto or a US East location; latency for Brazilian end users would be meaningfully worse than a São Paulo-local option, though the included CDN would help cache and reduce the practical impact for repeatedly-viewed images.

**Notable gotchas:** The flat $5/month minimum is a fixed floor even if actual usage (e.g., a handful of small networks each with dozens of images) is far below the included 250 GiB / 1 TB — i.e., cheaper in absolute dollars than pay-as-you-go at very low volume is not guaranteed; it's a flat fee regardless of whether you use 1 GiB or 250 GiB. No Brazil region is the main functional gap for this project specifically.

**Confidence:** High — figures came directly from DigitalOcean's own documentation.

---

## 5. Supabase Storage

**Classification:** S3-API-compatible object storage layered on top of a general backend-as-a-service platform (Postgres, Auth, Storage, Edge Functions) — relevant here mainly because it also natively speaks the S3 API and, notably, has a real São Paulo region.

**Storage cost:** Free tier includes **1 GB**; paid (Pro/Team) tiers include **100 GB** in the base subscription price, with additional storage billed at **$0.0213/GB-month** beyond that. Note Supabase's paid tiers have their own base subscription cost (Pro starts around $25/month per widely-reported figures, not independently re-verified in this pass) — i.e., using Supabase Storage in isolation still generally means being on a paid Supabase plan once free-tier limits are exceeded, unlike a pure object-storage bill.

**Egress cost:** Free tier includes **5 GB** of storage egress; Pro/Team tiers include **250 GB/month** of egress as part of a platform-wide **"Unified Egress Quota"** that Storage shares with Database, Auth, API, Edge Functions, and log drains — meaning image-serving egress is not isolated, it competes with the rest of the app's egress budget. Beyond the quota: **$0.09/GB** for standard (uncached) egress, or **$0.03/GB for cached egress** (i.e., roughly 3x cheaper if a CDN/cache layer is in front of the objects).

**Request costs:** Not separately itemized as PUT/GET pricing in what was found; storage and egress are the primary billed dimensions.

**Free tier:** Yes (1 GB storage / 5 GB egress), part of Supabase's overall free project tier, which also includes a small free Postgres database — plausible for pure prototyping, but 5 GB of shared/unified egress would be consumed quickly by repeated image views across several networks' sellers.

**S3-API compatibility:** Yes — Supabase Storage exposes an S3-compatible API in addition to its own REST/JS client API, so a provider-agnostic S3 adapter would work here too.

**CDN / image transformation:** Yes — Supabase offers built-in **Image Transformations** (resize/optimize on the fly via URL parameters), which directly matters for showing right-sized mobile thumbnails. Pricing: **100 "origin images" included, then $5 per 1,000 origin images** — billed per distinct source image transformed, not per view, similar in spirit to Cloudflare's model, though this feature is **not available on the Free plan**, only from Pro upward.

**Brazil region/latency:** Supabase explicitly offers a **South America (São Paulo) region**, using AWS's `sa-east-1` under the hood — a real, direct match for this project's Brazil-based audience, and a genuine differentiator relative to Backblaze B2 or DigitalOcean Spaces (neither of which has a Brazil region).

**Notable gotchas:** Storage/egress costs are bundled into Supabase's broader platform pricing and its shared "Unified Egress Quota," which makes isolated image-storage cost harder to reason about compared to a dedicated object-storage bill, and ties the decision to adopting Supabase as a platform (Postgres/Auth/etc.) rather than picking storage as a standalone, swappable piece — a consideration since this project already runs its own Postgres/TypeORM/Fastify backend and doesn't need Supabase's other services. Image Transformations requires a paid plan.

**Confidence:** High on the numbers found (official pricing page); Medium on exact current base subscription price for Pro (sourced from secondary aggregators, not independently re-confirmed against Supabase's own page in this pass).

---

## 6. Wasabi

**Classification:** S3-API-compatible ("100% bit-compatible with AWS S3 and IAM APIs" per Wasabi's own docs) object storage, marketed on flat low pricing with "free" egress within usage limits.

**Storage cost:** Pay-as-you-go pricing starts at **$6.99/TB-month** ≈ **$0.007/GB-month** (one secondary source cites $7.99/TB; Wasabi's own page confirms the sub-$7/TB "up to 80% less than hyperscalers" positioning but the exact current headline figure varied slightly between the sources checked — treat as **~$0.007–0.008/GB-month, exact cent value low-confidence** without a fresh direct read of the live pricing page at commit time). Reserved-capacity discounts exist for 1/3/5-year commitments — not relevant for an MVP.

**Egress cost:** Marketed as **"no fees for egress or API requests,"** but this is conditional, not unconditional: Wasabi's own FAQ confirms free egress applies **only while monthly egress stays within a 1:1 ratio to your active stored volume (and under a 100 TB/month absolute ceiling)** — e.g., if you store 10 GB, you get roughly 10 GB/month of free egress; downloading significantly more than what's stored triggers overage charges. For this project's read-heavy pattern (many sellers repeatedly viewing the same modest set of images), this ratio cap is the single most important thing to verify before committing, since "repeatedly viewed by many sellers" is exactly the pattern that can push egress well above the stored-volume ratio.

**Request costs:** None highlighted as a separate line item — Wasabi advertises "zero API request fees" as part of its flat-pricing pitch.

**Free tier:** A free trial exists (per Wasabi's "Start a Free Trial" CTA) but specific terms (duration/capacity) were not detailed on the pricing page fetched — **unverified**. No confirmed permanent free tier akin to B2's 10 GB.

**S3-API compatibility:** Yes, and unusually strongly so — Wasabi explicitly claims "100% bit-compatible" with both the S3 and IAM APIs, including support for Signature v2 and v4, positioning itself as a drop-in S3 replacement.

**Brazil region/latency:** Wasabi's published storage regions span North America, Europe, and Asia-Pacific (e.g., Oregon, Virginia, Texas, Toronto, UK, Paris, Amsterdam, Frankfurt, Milan, Tokyo, Osaka, Sydney, Singapore) — **confirmed no Brazil/South America region**. Nearest is likely Toronto. Latency for Brazilian users would need a CDN in front to be acceptable, similar to the B2 situation.

**Notable gotchas:** Two commonly-cited operational caveats (from secondary sources, not fully re-verified against Wasabi's own FAQ text in this pass, but consistent enough across sources to flag): a **minimum storage duration** (commonly reported as 90 days — deleting an object before that may still incur a minimum-duration charge) and a **minimum monthly commitment** on some account types. These matter for a catalog where sellers might replace/delete product photos somewhat frequently (rebranding, discontinued products) — churn-heavy small objects could trigger minimum-duration charges. This should be confirmed directly against Wasabi's current FAQ (`wasabi.com/pricing/faq`) before adoption, since minimum-duration policies are exactly the kind of detail that changes between account types/plans.

**Confidence:** Medium — the "S3-compatible" and general "low flat price, conditional free egress" shape is well-evidenced from Wasabi's own pages, but exact current headline price-per-TB and the minimum-duration/commitment terms carry some cross-source inconsistency and should be re-confirmed directly before any commercial decision.

---

## 7. Comparison Table

| Provider                | Storage $/GB-mo                                                       | Egress                                                                                                                  | Requests                                                      | Free tier                                                             | S3-compatible                        | CDN / image transform                                                               | Brazil region                                                                                                 | Key gotcha                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AWS S3**              | $0.023 (`us-east-1`); higher in `sa-east-1` (exact figure unverified) | 100 GB/mo free, then ~$0.09/GB tapering down at volume                                                                  | Yes, per 1,000 requests (exact rates unverified in this pass) | Time-limited new-account free tier only                               | Yes (reference implementation)       | None built-in; pair with CloudFront + separate resize solution                      | Yes — `sa-east-1` (São Paulo)                                                                                 | Egress-heavy pricing is the worst fit for a read-heavy image workload among these options                                                                    |
| **Cloudflare R2**       | $0.015                                                                | **$0.00 — free at any volume**                                                                                          | Class A (write) $4.50/M, Class B (read) $0.36/M               | 10 GB storage + 1M/10M ops/mo, ongoing (not time-limited)             | Yes                                  | Cloudflare Image Transformations (separate product): 5,000 free/mo then $0.50/1,000 | No dedicated "region," but served via Cloudflare's global edge (incl. Brazil PoPs, not individually itemized) | Newer product; bucket placement is "location hints," not a guaranteed Brazil-local region                                                                    |
| **Backblaze B2**        | $0.0068 (cheapest raw storage)                                        | Free up to 3x stored volume, then $0.01/GB; **free unlimited via Bandwidth Alliance CDN (Cloudflare/Fastly/bunny.net)** | Class A/B/C free; Class D $0.004/10,000                       | **10 GB, permanent**                                                  | Yes (S3-Compatible API, v4-sig only) | None built-in; needs external CDN                                                   | **No** — nearest is Toronto/Amsterdam/US                                                                      | No Brazil presence at all; a CDN is close to mandatory for latency, not just cost                                                                            |
| **DigitalOcean Spaces** | Flat $5/mo incl. 250 GiB, then $0.02/GiB                              | Flat $5/mo incl. 1 TB, then $0.01/GiB                                                                                   | Included in flat fee (no separate line item found)            | No permanent free tier (promo credit only)                            | Yes                                  | **CDN included free**; no image resizing built in                                   | **No** — nearest is Toronto/US/Europe                                                                         | $5/mo fixed floor regardless of actual (low) usage; no Brazil region                                                                                         |
| **Supabase Storage**    | Free: 1 GB; Pro: 100 GB incl., then $0.0213/GB                        | Free: 5 GB; Pro: 250 GB incl. (shared platform-wide quota), then $0.09/GB (or $0.03/GB cached)                          | Not separately itemized                                       | Yes (1 GB / 5 GB, part of free project)                               | Yes                                  | **Image Transformations built in**: 100 images free, then $5/1,000 (Pro+ only)      | **Yes — São Paulo (`sa-east-1`)**                                                                             | Costs and quota are bundled into the broader Supabase platform, not an isolated object-storage bill                                                          |
| **Wasabi**              | ~$0.007–0.008 (exact figure low-confidence)                           | "Free" but capped at 1:1 ratio to stored volume, 100 TB/mo ceiling                                                      | None highlighted (marketed as zero)                           | Free trial exists, terms unverified; no confirmed permanent free tier | Yes ("100% bit-compatible" claim)    | None built-in                                                                       | **No** — nearest is Toronto/US/Europe                                                                         | Conditional egress cap is easy to blow past under a "many viewers, same images" pattern; possible minimum storage duration/commitment (unverified specifics) |

---

## 8. Recommendation for Estoque Vivo

**Context driving the decision:** a small number of network Owners, each uploading a modest number of product photos (dozens to low hundreds per network); those photos are then viewed repeatedly by that network's associated sellers, mostly on mobile, mostly from Brazil; budget for the MVP is tight-to-near-zero; and the project explicitly wants a provider-agnostic S3-style adapter so the provider can be swapped later without a rewrite.

Given that framing, two things dominate the decision:

1. **This is a read-heavy workload** (write once per photo, read many times by many sellers), so **egress pricing matters far more than storage pricing** — a provider charging per-GB for repeated downloads (like raw AWS S3) is a bad structural fit even though its absolute costs would still be small at this scale today.
2. At "dozens to low hundreds of images per network," **absolute storage volume will be tiny** (realistically single-digit GB total across all networks for a long time), so free tiers and zero/near-zero egress matter more than shaving fractions of a cent off per-GB storage price.

### Primary recommendation: Cloudflare R2

- **Zero egress fees at any volume** is the single best structural match for "many sellers repeatedly viewing the same photos" — this is exactly the cost risk that would otherwise creep up over time on a provider like AWS S3.
- The **free tier (10 GB storage, 1M write / 10M read operations per month, ongoing — not time-limited)** very plausibly covers this project's entire MVP and early-growth footprint at $0/month, with no credit card surprises from download volume.
- **Full S3-API compatibility** means the project can build its storage adapter against the standard S3 SDK/interface from day one, satisfying the "swap providers later without a rewrite" goal — the same adapter code that talks to R2 today would work against AWS S3, Backblaze B2, DigitalOcean Spaces, or Wasabi with just endpoint/credential changes.
- **Cloudflare Image Transformations** provides an actual path to on-the-fly resized/optimized mobile thumbnails (important for a mobile-heavy seller audience) without building a custom image-processing pipeline, and it composes with R2's zero-egress model — at this project's scale (well under 5,000 unique transforms/month), this would also likely be free.
- The main soft spot — no single named "Brazil region" the way AWS/Supabase have — is mitigated by Cloudflare's large global edge network, which does include Brazilian points of presence for content delivery; this is a reasonable expectation but was not independently latency-tested in this research pass and is worth a quick real-world check (e.g., a test upload + timed fetch from a Brazilian IP/VPN) before fully committing.

### Fallback alternative: Backblaze B2 (paired with a Bandwidth Alliance CDN, e.g., Cloudflare or bunny.net)

If R2 doesn't work out for some reason (e.g., a Cloudflare-account-level issue, a preference to avoid depending further on Cloudflare, or a specific feature gap discovered later), **Backblaze B2** is the strongest fallback:

- Cheapest raw storage of all six providers reviewed ($0.0068/GB-month).
- A **permanent, non-time-limited 10 GB free tier**, and even paid usage has free egress up to 3x stored volume — likely to cover this project's read pattern without any egress bill at all even without a CDN, given the small photo counts involved.
- Confirmed **free, unlimited egress when paired with a Bandwidth Alliance CDN partner** (Cloudflare, Fastly, or bunny.net) — which also solves B2's lack of a Brazil region, since the CDN partner provides the Brazil-local edge presence B2 itself lacks.
- Has a documented **S3-Compatible API**, preserving the same provider-agnostic adapter strategy (with the minor caveat that it supports only Signature v4, not v2 — not an issue for a modern SDK).
- The trade-off versus R2: no built-in image-transformation/resizing product, so mobile thumbnail generation would need to be handled at upload time in the app (e.g., generate 1–2 fixed sizes server-side on upload) rather than on-the-fly at the edge — a small amount of extra implementation work, but well within reach for a Node.js/Fastify backend using a library like `sharp`.

### Providers considered and not recommended as primary

- **AWS S3** — the most mature/ubiquitous option and has a genuine São Paulo region, but its egress-per-GB pricing model is the worst structural fit for a "many repeat viewers" workload; would need CloudFront layered on top to be viable, adding cost and complexity that R2 or B2+CDN avoid natively.
- **DigitalOcean Spaces** — the flat $5/month minimum works against a "near-zero budget" MVP with tiny actual usage, and it has no Brazil region.
- **Supabase Storage** — genuinely attractive for the São Paulo region and built-in image transformations, but its storage/egress are bundled into the broader Supabase platform's pricing and shared "Unified Egress Quota" rather than being a clean, isolated object-storage decision; adopting it well for images alone would still likely mean taking on (or paying for) Supabase as a platform dependency the project doesn't otherwise need, which cuts against keeping storage as a swappable, standalone piece.
- **Wasabi** — cheap and S3-compatible, but its "free egress" is conditional on a 1:1 ratio to stored volume, which is precisely the constraint a "many sellers, same small set of photos" access pattern is likely to violate over time, turning the advertised free egress into a real bill; combined with no Brazil region and some unverified minimum-duration/commitment terms, it's a weaker fit than R2 or B2 for this specific use case.

### Practical next step (not part of this research, noted for the implementation phase)

Whichever provider is chosen, the S3-agnostic adapter this project wants should be built against the standard `@aws-sdk/client-s3` (or equivalent) interface so that R2 today and B2 (or any other S3-compatible provider) tomorrow are both just a config change (endpoint URL + credentials + bucket name), not a code rewrite — all six providers reviewed here support this interface to a workable degree, which is exactly the flexibility the project asked for.

---

## 9. Notes on Method and Limitations

- This research was performed via web search and unauthenticated page fetches of official provider pricing/documentation pages; no accounts were created and no live storage/egress/API calls were made against any of the six providers.
- AWS's own pricing page is heavily JavaScript-rendered, so some exact figures (S3 Standard `sa-east-1` per-GB rate, exact PUT/GET request pricing, exact egress tier breakpoints beyond the free 100 GB) could not be fully extracted directly from AWS's own page in this pass; these are flagged "unverified" or sourced from secondary aggregator pages and should be reconfirmed via the AWS Pricing Calculator before any commercial decision.
- Wasabi's exact current headline per-TB price and its minimum-duration/commitment terms showed minor inconsistency across the sources checked (Wasabi's own page emphasized the policy shape more than exact current numbers in the fetched content) and should be reconfirmed directly at `wasabi.com/pricing` and `wasabi.com/pricing/faq` before adoption.
- Latency claims for Brazil (especially Cloudflare R2's edge-network coverage and AWS `sa-east-1`'s real-world performance) are based on providers' general network-footprint claims, not independent latency measurements from Brazilian network vantage points — flagged as reasonable expectations, not measured facts.
- Pricing reflects what was published on provider pages as of 2026-09-01 and is subject to change; before any commercial commitment, re-check each provider's official pricing page directly.
