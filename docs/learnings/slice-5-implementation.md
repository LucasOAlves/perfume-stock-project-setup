# Learnings — Slice 5 Implementation (External Catalog Enrichment)

## Real, live third-party integration confirmed working

Unlike every other slice, this one was verified against a real external API, not just against our own Postgres instance. `CATALOG_PROVIDER=openbeautyfacts` was enabled in local `.env` and the API server restarted (env vars are read once at process start via `dotenv` — a running `tsx watch` process does **not** pick up `.env` changes on its own, only source-file changes). A real barcode (`3337875632683`, a La Roche-Posay product genuinely present in Open Beauty Facts' database — found via their public `/api/v2/search` endpoint, since most randomly-guessed barcodes return "product not found") was looked up through the actual UI and correctly pre-filled the product name and brand from live data.

This confirms the research finding from `docs/research/product-catalog-sources.md` in practice, not just on paper: coverage is real but sparse and inconsistent — the first two barcodes tried (picked without checking first) came back either "not found" or "found but no name/brand populated." The UI's design (a suggestion to review, never an auto-submit) is load-bearing here, not just a safety nicety — a meaningful fraction of real lookups return nothing useful, and manual entry has to feel like the normal path, not a fallback path.

## `.env` changes require restarting the dev server

`tsx watch` restarts on source file changes but not on `.env` changes, because `dotenv/config` only runs once at process start. Anyone testing `CATALOG_PROVIDER` (or any other env var) locally needs to kill and restart `npm run dev:api` after editing `apps/api/.env`, not just wait for the watcher.

## Regex control-character stripping and the Write tool

While writing `catalog-provider.ts`'s input-sanitization helper, an early attempt to write a regex character class as a code comment (describing stripping "control characters") somehow resulted in the file containing literal control-character bytes rather than the intended escaped regex source — `grep` reported the file as binary. Rewrote using `new RegExp("[\\u0000-\\u001F\\u007F]", "g")` (explicit escaped Unicode ranges, not a literal character class in a `/…/` regex-comment) to avoid the ambiguity entirely. **If a future edit to this file (or any file with a "strip control characters" style regex) makes `grep`/`git diff` report it as binary, this is almost certainly the cause — rewrite the regex construction, don't try to patch around it.**

## Why Open Beauty Facts and not Cosmos/Bluesoft

See [ADR-005](../decisions/ADR-005-catalog-provider.md) for the full reasoning — in short, Cosmos requires a paid API key to demonstrate at all (free tier: 25 queries/day) and the research report already found its data-accuracy is vendor-disclaimed regardless; Open Beauty Facts needed zero credentials to build and verify a real, working example of the `CatalogProvider` boundary end to end.

Verified end to end: 44/44 backend tests passing (3 new, using a stub provider — no test depends on network access, per `test/integration/setup.ts`'s explicit `NoopCatalogProvider` default), plus a real live lookup against Open Beauty Facts through the actual browser UI, successfully prefilling and saving a product with real third-party data.
