# Estoque Vivo

Product name as shown to real users: **Estoque Vivo** (`apps/web` UI, browser title). Internally — this repo's name, npm package names, database names, and all engineering docs below — the working codename **Shared Stock** is kept unchanged; it never appears in the running app. See "Product naming" in [`docs/product/product-spec.md`](docs/product/product-spec.md#product-naming) for why.

Shared ready-to-deliver perfume/cosmetics inventory for a stock Owner and their Associated Sellers. See [`docs/product/product-spec.md`](docs/product/product-spec.md) for the product spec, [`docs/plans/mvp.md`](docs/plans/mvp.md) for the vertical-slice plan, and [`docs/`](docs/) generally for the reasoning behind every architectural and domain decision — read those before changing behavior, not just this file.

This repository was built via a Compound Engineering workflow: `.agents/` holds the specialist briefs used to reach every decision under `docs/`, and `MASTER_PROMPT.md` is the process that produced them. All five MVP vertical slices are implemented and verified — identity/network/membership, stock mutation with movement history, reservations with concurrency correctness, delegated permissions, and optional barcode-based catalog enrichment. See `docs/plans/mvp.md` for the full breakdown and `docs/learnings/` for what each slice's real-world verification actually found.

## Stack

- **API**: Node.js/TypeScript, Fastify, TypeORM, PostgreSQL. Modular monolith — see [ADR-001](docs/decisions/ADR-001-architecture-style.md).
- **Web**: Angular (standalone components), mobile-first.
- **Auth**: phone + OTP, httpOnly session cookie, CSRF token — see [ADR-004](docs/decisions/ADR-004-authentication-mechanism.md).

## Local Development

Prerequisites: Node.js 20+, a running PostgreSQL instance.

`docker-compose.yml` is provided but **unverified** — Docker didn't work in this project's dev environment so far; the path below (a PostgreSQL server you already have running locally) is the one that's actually been used successfully. Use Docker instead if you have it working: `npm run db:up` starts it with the credentials already in `apps/api/.env.example`.

```bash
npm install

# Point apps/api/.env at your own local PostgreSQL (adjust user/password/host):
cp apps/api/.env.example apps/api/.env
# then edit DATABASE_URL and TEST_DATABASE_URL in apps/api/.env — these MUST be two
# different databases (see "Running tests" below for why), e.g.:
#   DATABASE_URL=postgres://postgres:<your-password>@localhost:5432/shared_stock
#   TEST_DATABASE_URL=postgres://postgres:<your-password>@localhost:5432/shared_stock_test
# create both databases first if they don't exist yet, e.g.:
#   node -e "const {Client}=require('pg');const c=new Client({connectionString:'postgres://postgres:<pw>@localhost:5432/postgres'});c.connect().then(()=>c.query('CREATE DATABASE shared_stock')).then(()=>c.query('CREATE DATABASE shared_stock_test')).then(()=>c.end())"

npm run migration:run          # applies apps/api/src/migrations to DATABASE_URL
# also apply migrations to TEST_DATABASE_URL (from apps/api/):
#   DATABASE_URL=<value of TEST_DATABASE_URL> npx typeorm-ts-node-commonjs migration:run -d src/config/data-source.ts

npm run dev:api                # Fastify on :3000 (OTP codes print to this console — see below)
npm run dev:web                # Angular dev server on :4200
```

Open http://localhost:4200. Sign in with any E.164-format phone number (e.g. `+5511999998888`); the OTP code is **not sent anywhere** in local dev — it's printed to the `dev:api` terminal (see `apps/api/src/modules/identity/otp-sender.ts`, `OTP_SENDER=console`). Never deploy with that OTP sender — it must be swapped for a real SMS/WhatsApp adapter behind the same `OtpSender` interface before production use.

Optional: set `CATALOG_PROVIDER=openbeautyfacts` in `apps/api/.env` (then restart `dev:api` — env vars are only read at process start) to enable real barcode-lookup pre-fill on the "new product" form via the free [Open Beauty Facts](https://world.openbeautyfacts.org/) API. See [ADR-005](docs/decisions/ADR-005-catalog-provider.md). Coverage of these specific Brazilian direct-sales products is sparse — manual entry is always the primary path regardless.

### Running tests

```bash
npm run test:api               # runs unit + integration tests together
```

The integration suite (`apps/api/test/integration/`) needs `TEST_DATABASE_URL` set to a **separate, migrated** PostgreSQL database — it calls `TRUNCATE` on every app table between tests, and if `TEST_DATABASE_URL` isn't set it silently falls back to `DATABASE_URL` and **wipes your dev data** (this happened once during development; see `docs/learnings/slice-2-implementation.md`). It exercises tenant isolation, invite lifecycle, capability enforcement, OTP rate limiting, stock-movement invariants, reservation concurrency, delegated-permission escalation, and catalog lookup — never against a real external API (see `docs/learnings/slice-5-implementation.md`) — all against real Postgres, per `docs/architecture/security-model.md` and `.agents/qa-engineer.md`. **Verified passing** (44/44) against a real local PostgreSQL instance — see `docs/learnings/` for the real bugs that surfaced only once a live database (and, for Slice 5, a real third-party API) was actually used: a test-parallelism deadlock, an OTP lockout bug, a dev/test database isolation incident, and a UX bug where two 403s sharing one error signal masked each other — all fixed.

## Repository Layout

```
.agents/            specialist briefs (product, domain, security, architecture, ...)
docs/product/        product spec, domain model
docs/architecture/    system design, security model
docs/decisions/       ADRs
docs/plans/           vertical-slice MVP plan
docs/research/         external catalog provider research
docs/learnings/        project-specific discoveries not yet worth a Skill
.skills/               reusable procedures for future agents
apps/api/            Fastify + TypeORM backend
apps/web/            Angular frontend
```
