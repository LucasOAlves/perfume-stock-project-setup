# ADR-006 — Product Image Storage: Manual URL for MVP, S3-Compatible Bucket Planned

## Status

Accepted. MVP decision (manual URL entry, no real upload) is implemented. Provider choice for the future real-upload feature is decided below, based on `docs/research/image-storage-providers.md` — not yet implemented (see "For later").

## Context

Products can already carry an `image_url` (populated automatically by the optional catalog-lookup enrichment — [ADR-005](ADR-005-catalog-provider.md) — or now editable by hand in the product form). There is no image _upload_ capability: no file picker, no storage bucket, no CDN. The user asked to plan real image inclusion — evaluating S3-compatible bucket providers, pricing, etc. — but explicitly asked for the current step to stay a "mock": a plannable, cheap, working placeholder now, with the real integration to follow later.

## Decision Drivers

- Real object storage (upload endpoint, presigned URLs, a provider SDK, bucket lifecycle policy, image size/type validation, CDN delivery) is a meaningfully-sized feature on its own — building it now, before any real user has asked to actually upload a photo instead of pasting a URL, would be scope creep relative to the MVP.
- The product already has a real, working path to get an image onto a Product: the manual URL field (this change) and the barcode-lookup suggestion (ADR-005). Neither requires any storage infrastructure.
- Whatever provider is chosen later should be swappable — matches the same `CatalogProvider`-style boundary pattern already used for the barcode lookup (ADR-001).

## Decision

**For now: manual `imageUrl` text field only** (`apps/web/src/app/features/inventory/product-form-page.component.ts`), shown on both product creation and editing, with a live broken-image-safe preview. No upload UI, no storage bucket, no new backend endpoint. The Owner pastes a URL to an image hosted anywhere (their own photo host, a marketplace listing, WhatsApp-shared CDN link, or the barcode-lookup suggestion) — validated only as a well-formed URL (existing `imageUrl` Zod schema), same as it already was for the catalog-lookup-populated value.

**For later (not built yet): Cloudflare R2**, with **Backblaze B2 (behind a Bandwidth Alliance CDN)** as the named fallback if R2 doesn't work out. Full comparison in `docs/research/image-storage-providers.md`; reasoning summarized here because it's the actual decision:

- This is a **read-heavy workload** — an Owner uploads a photo once, then every associated Seller views it repeatedly. That makes egress (download) pricing the dominant cost factor, not storage price. R2's **zero egress fee at any volume** is the best structural match found among six providers compared (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Supabase Storage, Wasabi); plain AWS S3's per-GB egress is the worst fit for exactly this access pattern.
- R2's free tier (10 GB storage + 1M write / 10M read operations per month, **not time-limited**) very plausibly covers this project's entire MVP and early-growth footprint at $0/month — realistic image volume here is "dozens to low hundreds of photos per network," i.e. low single-digit GB total for a long time.
- **Full S3-API compatibility** — the eventual `ImageStorage` adapter (below) is written against the standard S3 SDK interface, so switching to B2, AWS, or another S3-compatible provider later is a config change (endpoint + credentials + bucket), not a rewrite. This was a hard requirement, not a nice-to-have — see Decision Drivers.
- **Cloudflare Image Transformations** (a separate, composable product, first 5,000 unique transforms/month free) gives a real path to properly-sized mobile thumbnails without hand-building a resize pipeline — relevant since sellers are mobile-first.
- Backblaze B2 is the named fallback specifically because it's the cheapest raw storage, has a **permanent** 10 GB free tier, and gets free/unlimited egress when paired with a Bandwidth Alliance CDN partner (which also solves B2's lack of a Brazil-local presence) — but it has no built-in image-resizing product, so thumbnails would need to be generated server-side at upload time (e.g. with `sharp`) instead of on-the-fly at the edge.
- DigitalOcean Spaces (flat $5/month floor, no Brazil region) and Wasabi (egress "free" only up to a 1:1 ratio to stored volume — the exact ratio this project's "many viewers per photo" pattern is likely to exceed) were both evaluated and rejected as primary for reasons detailed in the research doc. Supabase Storage has a genuine São Paulo region and built-in transforms, but bundles storage/egress into its broader platform pricing and shared quota rather than being a clean, swappable, standalone piece — rejected for coupling the project to a platform dependency it doesn't otherwise need.

Implementation, when this is actually built:

- A `POST .../products/:id/image` (or similar) endpoint issuing a presigned upload URL, so the actual image bytes go straight from the browser to the bucket, never through the API server.
- An `ImageStorage` interface (mirroring `CatalogProvider`, per ADR-001's boundary pattern) with one real R2 adapter, built against `@aws-sdk/client-s3` (R2's S3-compatible endpoint) so swapping to B2 later is config, not code.
- Basic validation (file type, max size) before issuing the presigned URL.
- A decision on whether old images get deleted when replaced (lifecycle policy) or just orphaned (cheap enough at MVP image volumes to not bother initially).
- Before committing in production: a quick real-world latency check of R2's edge delivery from a Brazilian vantage point — the research flagged this as a reasonable expectation from Cloudflare's network footprint, not an independently measured fact.

## Consequences

- Zero infrastructure cost or setup for the MVP — this ADR's actual code change is one text input.
- Owners without an existing place to host a photo have no in-app way to add one yet (they can still use the barcode-lookup suggestion, or skip the image entirely — it's optional).
- The eventual real-upload feature is scoped and referenced from the code (`product-form-page.component.ts`'s field hint links here) so a future implementer isn't rediscovering why the field looks like this.

## Tradeoffs

Gained: real, usable image support today with no new dependency, no new endpoint, no new cost. Given up: the ability for an Owner to just snap a photo and have it appear — judged acceptable until real demand for that specific flow is evidenced.

## Security/Operational Impact

A pasted image URL is untrusted external content — the frontend must not eval or execute anything from it (an `<img>` tag is safe by construction), and the existing `imageUrl` Zod validation already exists at the API layer. No new attack surface versus what ADR-005 already introduced for the barcode-lookup image field.

## Revisit When

A real Owner asks for "let me just take a photo" instead of pasting a link — at that point, implement the real-upload flow described above (Cloudflare R2, `ImageStorage` interface). Also revisit the provider choice itself if R2 pricing/terms change materially, or if the pre-commit Brazil-latency check turns up a real problem — in which case fall back to Backblaze B2 + CDN as already reasoned above, not a fresh provider search.
