# ADR-001 — Architecture Style: Modular Monolith over Full Clean Architecture

## Status
Accepted

## Context

The master prompt mandates an explicit evaluation of full Clean Architecture (strict concentric layers, dependency inversion at every persistence/transport boundary, framework-independent domain model with mappers) before any simpler architecture can be accepted, and requires this ADR if Clean Architecture is rejected or only partially adopted.

The system is a modular monolith candidate: one Angular app, one Node/TypeScript API, one PostgreSQL database, built and maintained by a small team, with a bounded MVP scope (identity, networks/membership, catalog, inventory, reservations, audit).

## Decision Drivers

- Domain complexity is real but concentrated: the hard part is reservation concurrency and authorization, not a large or shifting domain model.
- QA strategy already mandates integration tests against real PostgreSQL for locking/constraint behavior (see `.agents/qa-engineer.md`), which removes much of the usual justification for a swappable-persistence abstraction — we are not going to run the domain against an in-memory fake as the primary test strategy.
- The external catalog provider and OTP/SMS delivery are the only boundaries with real, foreseeable volatility (vendor changes, provider outages, or the catalog research finding no viable provider at all).
- Small team size makes the ceremony cost of full layering (domain entities separate from persistence entities, mappers, per-repository interfaces for every aggregate, use-case-per-file DTOs) proportionally expensive relative to its benefit.
- Framework leakage (TypeORM entities used as if they were the domain model) is a real risk worth guarding against, but a full port/adapter layer for every entity is not the only way to guard against it.

## Options Considered

1. **Full Clean Architecture** — concentric layers (entities/use-cases/interface-adapters/frameworks), repository interfaces for every aggregate with TypeORM adapters behind them, domain model fully independent of TypeORM.
2. **Modular monolith with feature modules and explicit service/repository boundaries** — feature modules (identity, networks, catalog, inventory, reservations, audit), each with thin controllers → application services (business rules, transaction boundaries) → TypeORM repositories/entities. Dependency inversion (interface + adapter) applied only at genuinely external/volatile boundaries.
3. **Plain layered MVC-style backend** with no enforced module boundaries — rejected quickly: it would let inventory/authorization logic leak into route handlers across the whole surface the security reviewer is most worried about (network isolation, capability checks), which is the one place we cannot afford leakage.

## Decision

**Option 2 — modular monolith with feature modules.** Full Clean Architecture is rejected for this project.

Structure:
- Backend organized into feature modules: `identity`, `networks` (memberships, invites), `catalog` (products), `inventory` (stock movements), `reservations`, `audit`.
- Each module: thin HTTP controllers (validation + calling one application service, no business logic) → application services (own transaction boundaries, enforce domain invariants and capability checks) → TypeORM repositories/entities (no generic repository wrapper beyond what TypeORM already provides).
- Dependency inversion (an interface with a swappable adapter) is applied **only** at the two boundaries that are actually volatile: the external catalog provider (`CatalogProvider` interface; MVP ships a manual-entry-only "no import" implementation) and the OTP/SMS delivery provider (`OtpSender` interface).
- Everywhere else — Postgres via TypeORM — application services depend directly on repositories. Postgres is not going to be swapped, and QA already exercises it directly, so an abstraction here would only add indirection without adding real optionality.

What is **retained** from Clean Architecture, deliberately:
- Business rules and invariants live in application services, never in controllers or in the ORM entities themselves.
- Transport concerns (HTTP status codes, request/response DTOs) never leak into application services.
- The two genuinely volatile external integrations are still behind interfaces.

What is **not** adopted:
- A domain model fully independent of persistence types, with mapping layers between them.
- Repository interfaces for every aggregate purely for theoretical swappability.
- A dedicated "use case" class per operation with its own DTO/request/response types beyond what the application service method signature already provides.

## Consequences

- Faster to build and review for a small team; fewer files, fewer places for reviewers to check consistency.
- Slightly higher cost if PostgreSQL is ever replaced (unlikely, and not a goal — see non-goals).
- Slightly higher discipline required from the Senior Software Engineer / Code Reviewer agents to keep business rules out of controllers and out of TypeORM entities, since there's no compiler-enforced layer boundary — this is a process risk, mitigated by `.agents/code-reviewer.md`'s explicit review order (product/domain correctness and authorization before style).

## Tradeoffs

Gained: lower ceremony, faster iteration, test strategy that matches what QA actually wants to run (real Postgres). Given up: compiler-enforced independence from the persistence framework across the whole app (kept only at the two external-provider boundaries).

## Security/Operational Impact

None directly — authorization and tenant-isolation enforcement live in application services regardless of architecture style, and remain testable via API integration tests. See `docs/architecture/security-model.md`.

## Revisit When

- A second delivery channel (e.g. a public API partner, a second frontend) needs the same business rules without HTTP, which would justify extracting application services further.
- The team grows enough that module-boundary discipline can no longer be maintained by code review alone.
- Postgres or TypeORM actually needs to be replaced (not hypothetically — a concrete migration need).
