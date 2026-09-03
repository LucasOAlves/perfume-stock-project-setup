# Learnings — Slice 1 Implementation

## Update: verified end to end against a real, locally-running PostgreSQL

Docker was never usable in the original build sandbox and the user could not get Docker Desktop working locally either — **`docker-compose.yml` is unverified/unused; treat local PostgreSQL (not Docker) as the supported local dev path** until someone actually gets the Docker route working. What actually worked: a native PostgreSQL instance already running locally, superuser `postgres`, password supplied by the user, no database pre-created. Setup that worked:

```bash
node -e "const {Client}=require('pg'); const c=new Client({connectionString:'postgres://postgres:<password>@localhost:5432/postgres'}); c.connect().then(()=>c.query('CREATE DATABASE shared_stock')).then(()=>c.end())"
```

then set `apps/api/.env`'s `DATABASE_URL=postgres://postgres:<password>@localhost:5432/shared_stock`, `npm run migration:run`. The hand-authored migration applied cleanly with no drift from the entities.

With a real database available, this surfaced **two real bugs** the sandbox's typecheck/build/unit-test pass could not have caught (schema/migration bugs and concurrency bugs are exactly the class of thing that only shows up against a real database — this is _why_ `.agents/qa-engineer.md` insists on real Postgres integration tests instead of mocks):

1. **`vitest` ran integration test files in parallel by default**, but all of them share one Postgres instance and `TRUNCATE` the whole schema between tests (`test/integration/setup.ts`). Parallel files deadlocked and wiped each other's rows mid-test (Postgres error `impasse detectado` = deadlock detected). Fixed by setting `fileParallelism: false` in `apps/api/vitest.config.ts`. **If a future slice adds more integration test files, they inherit this constraint automatically — don't re-parallelize without giving each file its own database/schema.**
2. **Real bug in `IdentityService.verifyOtp`** ([identity.service.ts](../../apps/api/src/modules/identity/identity.service.ts)): the whole method ran inside one `dataSource.transaction()`. On an incorrect code, it incremented `challenge.attempts` and saved it, then threw `ValidationError` to reject the request — but throwing inside a TypeORM transaction callback rolls the transaction back, silently discarding the attempts increment along with everything else. The OTP lockout (`RATE_LIMITED` after 5 wrong attempts) never actually triggered; an attacker could brute-force a 6-digit OTP with unlimited guesses. Fixed by moving the failed-attempt increment outside any transaction (commits immediately, independent of whether the request is ultimately rejected) and keeping only the success path (mark consumed, create user, create session) inside a transaction. **General lesson: a mutation meant to survive a request's own failure path must never share a transaction with that failure path** — worth checking for the same pattern anywhere else a "record the failed attempt, then reject" flow gets added (e.g. any future rate-limiting on reservation/stock-mutation endpoints).

All 16 tests (5 unit + 11 integration) pass against the real database after both fixes. The full stack was also driven manually end to end — HTTP flow via curl (OTP request → verify → create network → create product, with real CSRF token round-tripping) and the Angular UI via browser automation (login → create network → create product, availability badge rendering correctly) — both against the same real Postgres instance.

## Also fixed while getting a live DB working

- `apps/api/package.json` was missing `ts-node` as a devDependency, which `typeorm-ts-node-commonjs` (used by the `migration:*` scripts) requires. Added.

## npm workspace hoisting: duplicate `rxjs` after `ng new`

Running `@angular/cli new` inside `apps/web` triggers its own `npm install`, which — even inside an npm workspace — created a _nested_ `apps/web/node_modules/rxjs` alongside the hoisted root one. This produced confusing TypeScript errors (`Observable<T>` from two different module resolution paths reported as incompatible types) that had nothing to do with the actual code. Fix was `rm -rf apps/web/node_modules/rxjs` after scaffolding, letting Node's module resolution fall through to the root copy. If a future `npm install` reintroduces a nested `rxjs` (or any other package apps/api and apps/web both depend on) and TypeScript errors mention two different `node_modules` paths for the "same" type, this is the first thing to check — not a real type error in the code.

## Deferred to Slice 2+ (per `docs/plans/mvp.md`, not a gap in Slice 1 itself)

`reserved_quantity` and the DB constraints tying it to `on_hand_quantity` already exist on `products` from Slice 1 (built in from the start per the domain model), but nothing sets `reserved_quantity` yet — it stays `0` until Reservations ship in Slice 3. Stock movements (Slice 2) and reservations (Slice 3) are the next real work, not follow-up cleanup on Slice 1.
