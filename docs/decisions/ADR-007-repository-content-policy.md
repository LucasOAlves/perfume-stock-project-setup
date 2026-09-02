# ADR-007 — What Goes Into Version Control (Public Repository Content Policy)

## Status
Accepted

## Context

The repository is about to get its first `git init` and initial commit, with the explicit expectation that it may become (or already is intended to be treated as) a **public** repository. Before that first commit, everything in the working tree needs a clear yes/no on whether it belongs in version control — most urgently credentials and local environment config, but the user specifically also flagged uncertainty about two categories that are *not* obviously secrets: ADRs and the rest of `docs/`.

## Decision Drivers

- Credentials, session secrets, and database passwords must never reach a public repository, full stop — this is non-negotiable and not really a judgment call.
- Everything under `docs/`, `.agents/`, and `MASTER_PROMPT.md` is the actual deliverable of this project's Compound Engineering process — the master prompt's entire premise (`MASTER_PROMPT.md` §1) is that the repository should "progressively accumulate product understanding, domain language, architectural reasoning, security decisions... so the next similar task requires less reasoning." None of that compounds if it isn't committed.
- A public repository is a reasonable place for architecture/product reasoning as long as it contains no secrets, no real user PII, and no information that would help an attacker beyond what's already implied by the (also public) source code itself.

## Decision

**Commit:**
- All application source code (`apps/api/src`, `apps/web/src`), migrations, tests, and configuration templates (`.env.example`).
- All of `docs/` — product spec, domain model, system design, security model, ADRs (including this one), vertical-slice plans, learnings, and research reports (catalog providers, image storage). **None of this is a secret.** It's reasoning and documentation, not credentials or user data. Security-relevant content in `docs/architecture/security-model.md` (rate limits, the shape of the auth flow, capability names) is exactly the kind of thing that's already knowable from the source code sitting right next to it in the same public repo — documenting it doesn't create new exposure, and *not* documenting it would just make the codebase harder to review, including by the security-conscious readers a public repo attracts.
- `.agents/` and `MASTER_PROMPT.md` — the specialist briefs and process that produced every decision under `docs/`. Excluding these while keeping their output (`docs/`) would make the docs harder to trust/audit, not easier.
- `package.json` / `package-lock.json` (both root and per-app) — needed for anyone (including a future agent) to reproduce the exact dependency tree.
- `docker-compose.yml` — uses placeholder dev-only credentials (`shared_stock`/`shared_stock`), not anything real; matches `.env.example`.

**Never commit (enforced via `.gitignore`):**
- `.env` (and `.env.local`) — real local credentials: this repo's `apps/api/.env` currently holds a real local PostgreSQL password and a session-signing secret. `.env.example` (checked in) carries only placeholders and is what a new clone is supposed to copy and fill in — see the README's setup steps.
- `node_modules/`, `dist/`, `build/`, `coverage/`, `.angular/` — reproducible from source + lockfile; committing them bloats history for no benefit and risks accidentally shipping a stale/locally-patched build.
- `.claude/settings.local.json` — personal Claude Code tool permissions, machine-specific, not portable. (A non-`local` `.claude/settings.json`, if one is ever added for genuinely shared team config, would be fine to commit — the `local` suffix is what marks a file as personal.)
- OS junk (`.DS_Store`, `Thumbs.db`) and log files (`*.log`).

**Judgment call, resolved:** ADRs and `docs/` generally were the two categories the user was unsure about. Resolved above as **commit** — they're reasoning artifacts, not secrets, and excluding them would defeat the actual purpose of this project's workflow.

## Consequences

- The full reasoning trail (why phone+OTP over passwords, why the reservation locking strategy, why Cloudflare R2 over AWS S3, etc.) is publicly reviewable alongside the code that implements it — a genuine asset for a public repo, not a liability.
- Local dev setup requires each developer to copy `.env.example` → `.env` and fill in their own values (already documented in the README) — this is standard practice, not new friction introduced by this decision.
- If a genuinely sensitive fact ever needs recording (e.g., a real production incident with real user data), it does **not** go in `docs/learnings/` verbatim — it gets sanitized (no real phone numbers, no real names, no production credentials/URLs) before being written down, the same way the security model already treats phone numbers as data to minimize, not data to log freely.

## Security/Operational Impact

Before *every* commit — not just this first one — run `git status` (and `git diff --cached` for anything unexpected) and specifically check for: any `.env` file, any file with a real password/token/API key pasted in literally, any real user phone number or personal data from manual testing. This first commit was preceded by exactly that check. Repeat it every time — don't assume `.gitignore` alone is a sufficient net for a mistake made *inside* a tracked file.

## Revisit When

The repository's visibility changes (public → private or vice versa) — a private repo could reasonably relax some of this (e.g., committing a `.env.local` with shared team dev credentials might become reasonable), but nothing here should get *stricter* by going private, only potentially more permissive, and only deliberately, not by default.
