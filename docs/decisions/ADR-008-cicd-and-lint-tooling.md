# ADR-008 — CI/CD Pipeline and Lint/Format Tooling

## Status

Accepted

## Context

Until now, typecheck, build, and the 49-test integration suite only ran on whoever's local machine was doing the work — no gate existed before a change could reach `main` on the now-public repository (`github.com/LucasOAlves/perfume-stock-project-setup`). The progress report also flagged lint/formatting as an undecided gap: no ESLint or Prettier configured anywhere in the repo.

## Decision Drivers

- The integration suite is the actual safety net for the invariants this project cares about most (tenant isolation, reservation concurrency, privilege escalation) — see ADR-002, ADR-003, `docs/architecture/security-model.md`. A CI pipeline that doesn't run it against a real PostgreSQL isn't testing the things that matter.
- `apps/api/test/integration/setup.ts` already enforces `TEST_DATABASE_URL` ≠ `DATABASE_URL` locally (see `docs/learnings/slice-2-implementation.md` for the incident that produced that rule) — CI should honor the same rule, not carve out a "just this once" exception.
- Angular's own linter, `angular-eslint`, only integrates with ESLint — there's no Biome equivalent for Angular template/component conventions, so picking Biome for the backend and ESLint for the frontend would mean two lint tools in one small monorepo for no real benefit.
- The repo already has ~13k lines written without a formatter — adopting Prettier should not force a repo-wide reformat that obscures the actual diff of every future PR, nor should it silently normalize `apps/api`'s existing double-quote style and `apps/web`'s existing single-quote (Angular CLI default) style into one.

## Options Considered

1. **No CI for now, decide later.** Rejected — the report already flagged this as a real gap, and the repo is public; an unreviewed `main` is not viable for that reason alone.
2. **GitHub Actions.** Free for public repos, no new account/service to provision, and the code already lives on GitHub.
3. **A third-party CI (CircleCI, GitLab CI, etc.).** Rejected — would mean a second account and a second place to look for build status, for no capability GitHub Actions lacks here.
4. **Biome** (combined linter+formatter) instead of ESLint+Prettier. Rejected — see Decision Drivers: no Angular template linting story.
5. **ESLint (flat config) + Prettier**, scoped so `apps/web` keeps its Angular-specific rules and existing quote style, `apps/api` gets plain TypeScript rules.

## Decision

**GitHub Actions**, one workflow (`.github/workflows/ci.yml`), triggered on `push`/`pull_request` to `main`, with two parallel jobs:

- **`api`** — spins up a `postgres:16-alpine` service container using the same non-secret dev credentials already in `docker-compose.yml`, creates the second (`_test`) database, runs migrations against both, then typecheck → build → the full integration suite → lint. This is a direct mirror of the local setup in the README, not a CI-specific shortcut.
- **`web`** — lint → build. No database needed.

**ESLint (flat config, `eslint.config.js`) + Prettier (`.prettierrc.json`)**, with `angular-eslint` rules scoped to `apps/web/**` only, and Prettier's `overrides` preserving each app's existing quote convention rather than unifying them. `@angular-eslint/prefer-inject` is explicitly turned off — the whole `apps/web` codebase consistently uses constructor injection (a fully valid Angular pattern), and enabling that rule would flag every existing component for a style preference, not a bug; a deliberate migration to `inject()` later is a separate decision, not a side effect of adding lint.

No deploy step in this workflow — hosting for the API, Postgres, and the Angular build is still undecided (see the "Deploy" track in the progress report). Branch protection requiring these checks before merge is a manual step on GitHub (`Settings → Branches`) — not something this session could do without an authenticated `gh` CLI.

## Consequences

- Every push/PR now gets a real signal on whether the reservation-concurrency test, the privilege-escalation tests, and the rest of the 49-test suite still pass — against a real database, not a mock.
- A first `prettier --write .` pass reformatted the existing codebase to match the new config (whitespace/line-width only — verified with a full typecheck + build + test run afterward, all green, per `docs/learnings/`).
- Two small real bugs surfaced by the lint pass itself, fixed as part of adopting it: an unused `Column` import in `membership-capability.entity.ts`, and a stale `eslint-disable-next-line no-console` comment predating this ADR in two files.

## Tradeoffs

Gained: a real CI gate that exercises the exact invariants this project is most worried about getting wrong, plus baseline lint/format consistency. Given up: some CI minutes per run (two Node installs, one Postgres container) — acceptable at this project's size, and GitHub Actions minutes are free for public repos regardless.

## Security/Operational Impact

The Postgres credentials in the workflow file are the same placeholder dev-only values already public in `docker-compose.yml` and `.env.example` (see ADR-007) — not a new exposure. No production secrets are referenced by this workflow; it never deploys anything.

## Revisit When

A deploy step is added once the "Deploy" track is decided (hosting for API/Postgres/frontend) — at that point, real secrets (session cookie secret, production DB credentials) move into GitHub Actions' encrypted Secrets, never into the workflow file itself. Also revisit `@angular-eslint/prefer-inject` if the team deliberately decides to migrate to `inject()`.
