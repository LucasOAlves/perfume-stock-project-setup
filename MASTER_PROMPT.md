# COMPOUND ENGINEERING MASTER PROMPT
## Shared Perfume Inventory

We are going to build a real shared-inventory product from an almost empty repository.

The repository intentionally begins with specialized agents under:

`.agents/`

There is no application yet.
There are no predefined Skills.
There is no frontend.
There is no backend.
There is no database.
There is no infrastructure.
There is no product documentation.
There is no implementation plan.

The goal is NOT to generate the maximum amount of software quickly.

The goal is to use a Compound Engineering workflow in which the repository progressively accumulates:

- product understanding;
- domain language;
- architectural reasoning;
- security decisions;
- reusable engineering procedures;
- implementation patterns;
- verified external-integration knowledge;
- test strategy;
- lessons learned;
- constraints that help future agents make better decisions.

The repository should become easier and safer to evolve after each vertical slice.

---

# 1. CORE ENGINEERING PRINCIPLE

Optimize for:

- real user value;
- correctness;
- simplicity;
- maintainability;
- security;
- low operational burden;
- accessible UX;
- reusable knowledge;
- reduced rediscovery.

Follow this lifecycle:

DISCOVER → RESEARCH → DEFINE → MODEL → PLAN → IMPLEMENT → REVIEW → TEST → REFLECT → COMPOUND KNOWLEDGE → NEXT ITERATION

The next similar task should require less reasoning than the previous one.

---

# 2. DO NOT CODE IMMEDIATELY

Do NOT begin by scaffolding Angular.
Do NOT begin by creating Node routes/controllers.
Do NOT begin by generating TypeORM entities or migrations.
Do NOT begin by creating Dockerfiles.
Do NOT begin by generating a large folder structure.

First:

1. inspect the repository;
2. inspect all available agents;
3. understand the user problem;
4. challenge assumptions;
5. research relevant external data sources;
6. define product scope;
7. establish domain language;
8. model critical invariants;
9. identify security and privacy risks;
10. evaluate architecture;
11. evaluate Clean Architecture explicitly;
12. create meaningful ADRs;
13. define the MVP as vertical slices;
14. create an implementation plan.

Then build.

---

# 3. AGENT SYSTEM

Before meaningful work, inspect every agent under `.agents/`.

Understand:

- its mission;
- when it should participate;
- what it should challenge;
- what inputs it needs;
- what output it owns.

Agents represent WHO performs specialized work.

Do not involve every agent in every task.
Use the smallest useful set of specialists.

Review agents must search for weaknesses, not provide ceremonial approval.

For important decisions explicitly ask:

- What are we overengineering?
- What are we underthinking?
- What assumption lacks evidence?
- What can create incorrect stock information?
- What can create unauthorized access?
- What can create two sellers believing the same item is available?
- What creates user distrust?
- What can be simplified?
- Does this belong in the MVP?
- Is this abstraction justified now?
- Is this integration actually supported and legal to rely on?

---

# 4. PRODUCT

Build a professional MVP for shared ready-to-deliver inventory used by independent sellers.

Working product name:

**Shared Stock**

The name is provisional. Product/domain specialists may propose a better name.

Real-world motivating scenario:

A primary seller keeps physical ready-to-deliver perfume/cosmetics inventory in one location. Other associated sellers sell from that same inventory remotely and repeatedly need to ask whether a specific item is available.

The product should replace that repeated manual availability check with a trusted shared source of truth.

The system must let authorized associated sellers remotely:

- search products;
- see current available quantity;
- see whether quantity is reserved;
- reserve eligible quantity when allowed;
- understand whether a product is unavailable without needing to call the stock owner.

The primary inventory owner must retain control over stock mutation and permissions.

---

# 5. TARGET USERS

Initial user types:

1. Inventory Owner / Network Owner
   - owns or administers the shared physical inventory;
   - controls associated sellers;
   - controls who can mutate inventory;
   - normally performs stock entries, adjustments and confirmations.

2. Associated Seller
   - belongs to a seller network;
   - views shared inventory;
   - may create/cancel their own reservations if allowed;
   - may receive additional inventory permissions explicitly granted by the owner.

Do not assume these final names are correct.

The domain specialist must evaluate terminology such as:

- Sales Network;
- Owner;
- Administrator;
- Seller;
- Membership;
- Inventory;
- Product;
- Stock Item;
- Reservation;
- Stock Movement;
- Permission.

Avoid “matrix/branch” terminology unless the real domain justifies it.

---

# 6. CORE USER PROBLEM

Associated sellers cannot reliably know whether a ready-to-deliver item is still available without contacting the inventory owner.

This creates:

- repeated interruptions;
- slower sales;
- stale information;
- double promises;
- difficulty coordinating reservations;
- unnecessary dependence on one person;
- loss of confidence in availability.

The MVP must solve shared availability first.

Do not turn it into a complete ERP, CRM, e-commerce platform or accounting system.

---

# 7. CORE PRODUCT OUTCOME

The product succeeds when an associated seller can independently answer:

“Can I promise this product to my customer right now?”

and the answer reflects:

- current physical stock;
- active reservations;
- authorization rules;
- recent mutations;
- tenant/network isolation.

The availability shown must be trustworthy enough to replace a phone call.

---

# 8. PRIMARY JOURNEY

Keep this journey visible throughout development:

Owner creates/joins account
→ establishes a Sales Network
→ adds associated sellers
→ registers/imports products
→ records ready-stock quantity
→ seller opens shared inventory
→ searches product
→ checks available quantity
→ optionally reserves quantity
→ owner/sufficiently privileged user records stock changes
→ availability is recalculated consistently

Secondary features must not distract from this path.

---

# 9. MVP SCOPE CANDIDATES

Product discovery must validate and prioritize, but evaluate at least:

- minimal user registration/profile;
- authentication;
- Sales Network creation;
- owner/admin role;
- seller membership/invitation/linking;
- product catalog;
- product search;
- current stock quantity;
- reservation creation;
- reservation cancellation/release;
- owner visibility into reservations;
- permission management for stock mutation;
- stock adjustments/movements;
- auditability of sensitive mutations;
- basic responsive mobile-first UI;
- clear empty/loading/error states.

Do not assume every candidate belongs in Slice 1.

---

# 10. EXPLICIT NON-GOALS FOR INITIAL MVP

Unless discovery proves otherwise, keep these out of the initial MVP:

- full checkout;
- customer CRM;
- invoices;
- tax/fiscal issuance;
- commission calculation;
- payment processing;
- delivery logistics;
- marketplace;
- multi-warehouse logistics;
- purchase-order automation;
- advanced forecasting;
- loyalty program;
- social features;
- microservices;
- event sourcing;
- Kafka;
- Kubernetes.

External catalog import can be an MVP capability only if research finds a reliable, permitted and appropriately stable source. Manual product creation must remain viable.

---

# 11. MINIMAL PROFILE VS AUTHENTICATION

The visible business profile should remain intentionally small.

Prefer collecting only information that is necessary, approximately:

- display name;
- phone number;
- optional identifier only if justified.

Do not create an HR-like registration form.

However:

**minimal profile does not mean weak authentication.**

Product, security and architecture specialists must separately decide how identity is verified.

Evaluate low-friction options appropriate to the target users, such as:

- phone + OTP;
- passkey;
- magic link if email becomes justified;
- password-based login only if its operational/security tradeoff is acceptable.

Do not invent authentication requirements.
Do not store plaintext credentials.
Do not use phone number alone as proof of identity.

If the authentication approach is architecturally meaningful or expensive to reverse, create an ADR.

---

# 12. MULTI-TENANCY / NETWORK ISOLATION

A user may conceptually participate in one or more Sales Networks in the future, but do not expand MVP scope without evidence.

Regardless of implementation, every protected operation must be scoped to an authorized network context.

Critical invariant:

**A user must never read or mutate another Sales Network's inventory, memberships, reservations or permissions without explicit membership/authorization.**

Do not rely on frontend filtering for isolation.

Authorization must be enforced server-side.

Every read and write query involving network-owned data must make tenant/network scope explicit.

Security review must actively search for IDOR/BOLA-style failures.

---

# 13. AUTHORIZATION MODEL

Do not reduce authorization to a single global `isAdmin` boolean.

Model authorization in terms of network membership and capabilities.

Seed capabilities to evaluate:

- inventory.read;
- reservation.create;
- reservation.cancel.own;
- reservation.cancel.any;
- inventory.adjust;
- product.manage;
- member.manage;
- permission.manage;
- audit.read.

The final naming/model may differ.

The Network Owner must always be able to administer the network.

Associated sellers should receive least privilege by default.

The owner may grant stock-mutation permission to selected sellers.

Authorization must be checked on the backend for every protected action.

If RBAC, capability-based authorization, policy-based authorization or another model is chosen, document the reasoning. Create an ADR when the choice has meaningful alternatives and future cost.

---

# 14. INVENTORY DOMAIN INVARIANTS

The domain specialist, architect, backend expert and QA engineer must make inventory semantics explicit before implementation.

At minimum determine:

- what “physical/on-hand stock” means;
- what “reserved” means;
- what “available” means;
- whether a reservation reduces displayed availability without reducing physical stock;
- when physical stock decreases;
- whether negative stock is allowed;
- who may adjust stock;
- whether stock mutations require a reason;
- how cancellations/releases work;
- whether reservations expire;
- whether partial reservation is allowed;
- whether a seller can reserve more than available;
- what happens when two sellers reserve simultaneously;
- what happens when an owner adjusts stock below reserved quantity.

Default safety invariant unless product discovery explicitly rejects it:

`available quantity >= 0`

Do not implement availability as an eventually-consistent guess for the MVP.

Concurrency correctness is more important than cleverness.

---

# 15. RESERVATION CONCURRENCY

Two sellers may attempt to reserve the last unit concurrently.

This is a core domain race condition, not an edge detail.

The architecture must define a database-backed consistency strategy.

Evaluate approaches such as:

- transaction + row-level locking;
- atomic conditional update;
- optimistic concurrency/versioning;
- other PostgreSQL-safe mechanisms.

Do not choose based on fashion.

The selected approach must:

- prevent over-reservation;
- behave predictably under concurrent requests;
- be testable;
- keep the MVP understandable.

If the concurrency strategy materially shapes persistence/domain design, create an ADR.

QA must include a concurrent-reservation test.

---

# 16. STOCK MOVEMENTS AND AUDITABILITY

Avoid treating the current quantity as an unexplained mutable number if that makes operational errors impossible to understand.

Evaluate whether the MVP should keep:

- a current stock balance;
- append-only stock movement records;
- both.

Stock-changing actions should record enough context to answer:

- who changed it;
- when;
- by how much;
- why/type of movement;
- which network/product was affected.

Do not build an enterprise ledger unless needed.

Security-sensitive actions such as permission changes should also be auditable where practical.

---

# 17. PRODUCT CATALOG

Products should initially support only business-relevant fields.

Evaluate approximately:

- name;
- brand;
- product code/SKU;
- barcode/GTIN when available;
- category;
- image URL/reference when safely sourced;
- active/inactive status.

Avoid mandatory long descriptions or marketing metadata.

Manual product registration must work even if external catalog integrations are unavailable.

---

# 18. EXTERNAL PERFUME/COSMETICS DATA RESEARCH

Research public and legitimate product-data sources for brands such as:

- Natura;
- Avon;
- O Boticário;
- Eudora;
- other relevant brands discovered during research.

Do NOT assume an official public API exists.

The research agent must distinguish:

OFFICIAL SUPPORTED API
from
PUBLIC WEBSITE ENDPOINT
from
THIRD-PARTY API
from
SCRAPING
from
UNVERIFIED/INTERNAL ENDPOINT.

For every candidate source verify where possible:

- owner/provider;
- documentation;
- authentication;
- terms of use;
- licensing/reuse rights;
- rate limits;
- stability/versioning;
- fields available;
- image reuse rights;
- Brazil coverage;
- GTIN/SKU quality;
- costs;
- outage/failure behavior;
- whether production use appears permitted.

Prefer primary/official sources.

A technically accessible endpoint is NOT automatically a supported public API.

Do not bypass authentication, bot protections, access controls or contractual restrictions.

Do not make scraping part of the MVP without an explicit legal/product/architecture decision.

Research generic GTIN product APIs as fallback/enrichment options, but verify perfume/cosmetics coverage empirically before choosing one.

All external catalog providers must sit behind an application boundary if integration is adopted.

Manual entry is the safe fallback.

A meaningful provider decision should become an ADR.

---

# 19. CLEAN ARCHITECTURE EVALUATION — MANDATORY

Clean Architecture is a required architectural candidate, not a predetermined answer.

Before final architecture is accepted, the Software Architect must explicitly evaluate:

**Would Clean Architecture materially improve this product's maintainability, testability, domain clarity and dependency control relative to its complexity cost?**

Evaluate at least:

- domain complexity;
- authorization complexity;
- inventory/reservation invariants;
- persistence replacement/testability;
- external catalog-provider boundaries;
- team/project size;
- amount of ceremony introduced;
- likely future change;
- risk of framework leakage;
- cost of excessive layers.

Compare Clean Architecture with at least one simpler credible alternative, for example:

- modular monolith with feature modules and explicit service/repository boundaries;
- layered modular architecture;
- another justified structure.

Allowed outcomes:

A. Clean Architecture selected.
   - Document how it is applied pragmatically.
   - Do not create layers/interfaces with no meaningful boundary.

B. Clean Architecture rejected or partially adopted.
   - This MUST create an ADR.
   - The ADR must explain:
     - why full Clean Architecture is not appropriate;
     - alternatives considered;
     - architecture chosen;
     - which Clean Architecture principles are still retained;
     - consequences and tradeoffs.

Do not say “Clean Architecture is overkill” without concrete project-specific reasoning.

---

# 20. ARCHITECTURAL BASELINE

Prefer a modular monolith unless discovery finds a compelling reason otherwise.

The system should have:

- one Angular web application;
- one Node.js TypeScript API;
- one PostgreSQL database;
- explicit domain/module boundaries;
- TypeORM with migrations;
- Docker Compose for local dependencies where appropriate.

Do not create distributed-system complexity for hypothetical scale.

Potential domain modules to evaluate:

- identity/authentication;
- sales-networks/memberships;
- authorization;
- catalog/products;
- inventory;
- reservations;
- audit.

Do not blindly create one module per noun.
Boundaries must reflect ownership and behavior.

---

# 21. TECHNICAL STACK

Use unless an ADR justifies a change:

## Language
TypeScript

## Frontend
Angular
Angular Router
Angular forms appropriate to the chosen design
RxJS where reactive streams are actually useful

Prefer modern Angular conventions supported by the selected current stable version.

Do not adopt a large frontend state library by default.
Evaluate Angular signals/services and local feature state first.

## Backend
Node.js
TypeScript

The HTTP framework must be selected during architecture.
Do not assume Express/Fastify/Nest solely from habit.
If NestJS is proposed, explicitly evaluate whether its structure helps or duplicates the chosen architecture.

## Persistence
PostgreSQL
TypeORM
TypeORM migrations

Rules:

- migrations are the source of database schema evolution;
- never rely on `synchronize: true` outside disposable tests;
- entity definitions do not replace migration review;
- migration rollback/forward behavior must be considered;
- database constraints should protect important invariants when appropriate.

## Local environment
Docker Compose where useful.

---

# 22. ANGULAR PRINCIPLES

Build a mobile-first interface because sellers are likely to check stock from phones.

Prefer:

- standalone components where appropriate;
- typed APIs;
- small feature-focused components;
- clear smart/container vs presentational responsibilities only where it adds clarity;
- route-level lazy loading when useful;
- accessible forms;
- explicit loading/empty/error/success states;
- predictable state ownership;
- server as source of truth for permissions and inventory.

Do not:

- hide authorization rules only in guards;
- put domain logic inside components;
- duplicate API state unnecessarily;
- create giant shared modules;
- introduce NgRx automatically;
- build a desktop-first ERP UI.

Important UX target:

A seller should be able to search and understand availability in a few seconds.

---

# 23. BACKEND PRINCIPLES

Keep HTTP handlers/controllers thin.

Business rules belong in application/domain services/use cases according to the chosen architecture.

Explicitly validate:

- payloads;
- path/query identifiers;
- network membership;
- capabilities/permissions;
- quantities;
- product ownership/scope;
- reservation state transitions;
- external provider responses.

Use predictable typed application errors.

Never trust client-supplied tenant/network identity without verifying it against the authenticated principal.

Never expose:

- secrets;
- raw stack traces;
- database internals;
- provider credentials;
- sensitive authorization details useful for exploitation.

---

# 24. TYPEORM AND DATABASE CONVENTIONS

Use migrations for every durable schema change.

Architecture/backend agents must define conventions for:

- entity naming;
- table/column naming;
- timestamps;
- UUID vs other identifiers;
- foreign keys;
- unique constraints;
- indexes;
- soft delete only where justified;
- transaction boundaries;
- concurrency strategy;
- repository/query patterns.

Do not add generic repository abstractions merely to wrap TypeORM one-to-one.

Do not leak TypeORM-specific objects across boundaries if the chosen architecture requires persistence independence.

Use database constraints to complement, not replace, application validation.

---

# 25. SECURITY BASELINE

Treat every input and external response as untrusted.

Evaluate at least:

- authentication;
- authorization;
- tenant/network isolation;
- IDOR/BOLA;
- broken function-level authorization;
- privilege escalation;
- weak invitation/linking flows;
- brute force / OTP abuse if OTP is used;
- session/token storage;
- CSRF depending on auth transport;
- XSS;
- injection;
- mass assignment;
- rate limiting;
- sensitive error messages;
- secrets/environment variables;
- dependency risk;
- external image URLs;
- external catalog payloads;
- audit-log sensitivity.

Apply least privilege.

Do not log secrets, auth tokens or OTP values.

Phone numbers are personal data.
Collect and expose only what is necessary.

Do not display all member phone numbers to everyone unless product need justifies it.

Security recommendations should be proportional to an MVP but must block real cross-tenant or privilege-escalation risks.

---

# 26. PRIVACY / LGPD-AWARE DESIGN

This is not legal advice, but engineering should practice data minimization.

For personal data:

- collect only necessary fields;
- define purpose;
- avoid unnecessary replication;
- avoid exposing phone numbers broadly;
- support deletion/deactivation considerations;
- avoid sensitive data in logs;
- document retention assumptions that materially affect the system.

Do not invent compliance claims.

If a legal conclusion is required, flag it for qualified review.

---

# 27. API DESIGN

Prefer explicit resource-oriented or use-case-oriented contracts consistent with the architecture.

The API must make authorization context clear.

Do not expose persistence entities directly as public contracts.

Use validation schemas/DTOs.

Consider idempotency where repeated user actions or unreliable mobile networks can create duplicate effects.

Stock mutation and reservation endpoints must define conflict behavior.

Use appropriate HTTP status semantics, but prioritize stable application error codes/messages for frontend behavior.

---

# 28. OBSERVABILITY

For the MVP, provide useful operational visibility without building an observability platform.

At minimum consider:

- structured logs;
- request correlation;
- safe error reporting;
- failed auth/authorization visibility;
- stock mutation auditability;
- external catalog provider failures.

Never log secrets or unnecessary personal data.

---

# 29. TESTING STRATEGY

Tests must derive from product acceptance criteria and domain invariants.

Prioritize:

- domain/use-case unit tests;
- authorization tests;
- tenant isolation tests;
- repository/integration tests against PostgreSQL where database semantics matter;
- API integration tests;
- concurrent reservation tests;
- migration validation;
- Angular component/service tests where behavior warrants;
- a small set of high-value end-to-end flows.

Critical tests include:

- seller cannot access another network;
- seller without permission cannot adjust stock;
- privileged seller can adjust stock only in authorized network;
- reservation cannot exceed available quantity;
- two simultaneous reservations cannot over-reserve;
- reservation release restores availability;
- malformed/negative quantities are rejected;
- external catalog provider failure does not break manual product management.

Do not chase coverage percentage instead of risk coverage.

---

# 30. UX QUALITY

The UX must work for non-technical users.

Prefer domain language users understand over architecture terminology.

Key inventory list/search should make visible:

- product;
- brand if useful;
- available quantity;
- reserved quantity/status only when it helps;
- clear unavailable state.

Do not expose internal IDs.

Design for:

- small screens;
- intermittent/slow networks;
- accidental repeat taps;
- clear confirmation of reservations and stock changes;
- safe destructive actions;
- empty inventory;
- no search results;
- stale/conflict responses.

---

# 31. SKILLS

The repository starts without Skills.

Skills represent HOW a reusable capability is performed.

Create `.skills/<skill-name>/SKILL.md` only when knowledge is:

- reusable;
- procedural;
- non-trivial;
- likely to be needed again.

Create/update a Skill when at least two are true:

1. reasoning will recur;
2. multiple agents can reuse it;
3. meaningful domain knowledge was required;
4. getting it wrong materially hurts quality/security;
5. it has several repeatable steps;
6. it reduces future prompting;
7. it reduces future mistakes;
8. future agents would otherwise rediscover it;
9. review repeatedly finds the same failure;
10. it creates leverage across slices.

Likely eventual candidates, only after real use:

- tenant-authorization-checking;
- inventory-concurrency-testing;
- typeorm-migration-workflow;
- catalog-provider-evaluation.

Do not create speculative Skills during initialization.

---

# 32. ADRs

Create Architecture Decision Records only for meaningful decisions.

An ADR is justified when a decision:

- has real alternatives;
- materially affects architecture/security;
- would be expensive to reverse;
- is likely to be questioned later.

Use:

`docs/decisions/ADR-XXX-<slug>.md`

Suggested format:

# ADR-XXX — Title

## Status

## Context

## Decision Drivers

## Options Considered

## Decision

## Consequences

## Tradeoffs

## Security/Operational Impact

## Revisit When

Avoid ADR inflation.

Mandatory ADR condition:

**If full Clean Architecture is rejected, an ADR explaining why and documenting the chosen architecture MUST be created.**

Likely ADR candidates to evaluate, not blindly create:

- architecture style / Clean Architecture;
- authentication mechanism;
- authorization model;
- reservation concurrency strategy;
- stock balance vs movement model;
- external catalog provider strategy;
- monorepo/workspace structure if non-obvious.

---

# 33. DOCUMENTATION STRUCTURE

Use:

`docs/product/`
Stable product/domain understanding.

`docs/architecture/`
System structure, boundaries and security model.

`docs/decisions/`
ADRs.

`docs/plans/`
Executable vertical-slice plans.

`docs/learnings/`
Project-specific discoveries that do not yet justify a Skill.

`.skills/`
Reusable procedures.

`.agents/`
Specialist responsibilities.

Do not duplicate identical knowledge across files.

---

# 34. IMPLEMENTATION PLANS

Before meaningful implementation create/update a plan containing:

- OBJECTIVE
- USER VALUE
- SCOPE
- OUT OF SCOPE
- AFFECTED AREAS
- DOMAIN INVARIANTS
- AUTHORIZATION RULES
- DATA/MIGRATION CHANGES
- IMPLEMENTATION STEPS
- ACCEPTANCE CRITERIA
- TEST STRATEGY
- SECURITY CONCERNS
- UX STATES
- CONCURRENCY CONCERNS
- RISKS
- DOCUMENTATION/ADR IMPACT

Plans exist to reduce uncertainty, not to create ceremony.

---

# 35. FEATURE WORKFLOW

Every non-trivial change follows:

1. Plan first.
2. Consult the minimum useful agents.
3. Implement a vertical increment.
4. Validate types/build/tests.
5. Test observable behavior manually where applicable.
6. Run security/authorization review for sensitive changes.
7. Re-check architecture/product docs.
8. Create/update ADR only for real architectural decisions.
9. Reflect on reusable learning.
10. Suggest a commit/PR; never commit/push without explicit user instruction.

Do not silently change architecture during implementation.

If implementation reveals the approved design is wrong, surface it and update the plan/ADR before proceeding.

---

# 36. FIRST EXECUTION

Begin now.

Do NOT scaffold application code immediately.

## PHASE A — REPOSITORY DISCOVERY

Inspect:

- repository contents;
- every `.agents/*.md`;
- existing docs/skills if any.

Report only meaningful findings.

## PHASE B — PRODUCT DISCOVERY

Use at least Product Manager, Domain Expert and UX Expert where useful.

Define:

- target user;
- core problem;
- jobs to be done;
- product outcome;
- MVP scope;
- non-goals;
- primary journeys;
- trust requirements;
- terminology;
- open questions;
- acceptance-level product invariants.

Challenge the initial proposal.

## PHASE C — DOMAIN MODEL

Use Domain Expert + Architect + Backend Expert.

Define:

- Sales Network semantics;
- membership;
- roles/capabilities;
- product ownership;
- inventory balance;
- reservation lifecycle;
- stock movement semantics;
- critical invariants;
- conflict/concurrency behavior;
- audit needs.

Do not generate TypeORM entities yet.

## PHASE D — EXTERNAL CATALOG RESEARCH

Use Catalog Researcher.

Research Natura, Avon, O Boticário and relevant alternatives.

Produce a provider comparison with evidence and confidence.

Do not implement integration yet.

Explicitly classify each source as:

SUPPORTED OFFICIAL API / PUBLIC ENDPOINT / THIRD PARTY / SCRAPING / UNSUITABLE / UNKNOWN.

Recommend manual entry fallback regardless.

## PHASE E — SECURITY THREAT REVIEW

Use Security Reviewer.

Threat-model:

- authentication;
- network isolation;
- authorization;
- invitation/linking;
- inventory mutation;
- reservation races;
- personal data;
- external integrations.

Identify MVP blockers.

## PHASE F — ARCHITECTURE

Use Software Architect plus relevant frontend/backend/security specialists.

Design the simplest credible architecture.

Mandatory:

- evaluate full Clean Architecture;
- compare with a simpler architecture;
- decide;
- if rejecting full Clean Architecture, create the mandatory ADR;
- define Angular boundaries;
- define Node API boundaries;
- define TypeORM/migration strategy;
- define PostgreSQL transaction/concurrency strategy;
- define authorization enforcement;
- define provider boundary for product catalog;
- define testing strategy;
- define local-development approach.

Before finalizing ask:

- What are we overengineering?
- What are we underengineering?
- Which abstractions are premature?
- Which boundaries are genuinely volatile?
- Can cross-network access happen through any query path?
- Can two reservations oversell?
- What should remain deliberately simple?

## PHASE G — FOUNDATIONAL DOCUMENTATION

Create where justified:

- `docs/product/product-spec.md`
- `docs/product/domain-model.md`
- `docs/architecture/system-design.md`
- `docs/architecture/security-model.md`
- `docs/research/product-catalog-sources.md` if a research folder is justified
- `docs/plans/mvp.md`
- meaningful ADRs

Do not write application code yet.

## PHASE H — VERTICAL SLICE PLAN

Break MVP into small vertical slices with visible user value.

A reasonable hypothesis to challenge:

Slice 1 — identity + Sales Network + membership + read-only manual catalog/inventory
Slice 2 — owner stock mutation + movement history
Slice 3 — reservations with concurrency correctness
Slice 4 — delegated inventory permission
Slice 5 — external catalog enrichment/import if research supports it

Do not accept this ordering blindly.

Each slice must define:

- user value;
- scope;
- non-goals;
- acceptance criteria;
- authorization matrix;
- migration/data impact;
- failure states;
- test strategy;
- security risks.

## PHASE I — DISCOVERY CHECKPOINT

Present:

### PRODUCT UNDERSTANDING
### DOMAIN LANGUAGE
### MVP SCOPE
### NON-GOALS
### DOMAIN INVARIANTS
### AUTHENTICATION STRATEGY
### AUTHORIZATION MODEL
### INVENTORY/RESERVATION SEMANTICS
### EXTERNAL CATALOG FINDINGS
### CLEAN ARCHITECTURE EVALUATION
### CHOSEN ARCHITECTURE
### ADRS CREATED
### SECURITY RISKS
### MVP VERTICAL SLICES
### AGENTS CONSULTED
### SKILLS DISCOVERED
### WHAT THE REPOSITORY KNOWS NOW THAT IT DID NOT KNOW BEFORE

Only after this checkpoint proceed into application scaffolding and implementation, unless the invoking user explicitly asked for planning/discovery artifacts only.

---

# 37. COMPLETION STANDARD

A feature is not complete merely because code compiles.

Before completion verify:

- product behavior matches intent;
- domain invariants hold;
- server-side authorization is enforced;
- tenant/network isolation is tested;
- inputs are validated;
- concurrency risks are handled;
- migrations are present and reviewed;
- TypeScript passes;
- build passes;
- automated tests pass;
- critical manual flow works;
- empty/loading/error/conflict states exist where relevant;
- errors do not leak internals;
- docs remain accurate;
- ADR impact was considered;
- useful new knowledge was captured selectively.

The objective is not MORE FILES.

The objective is LESS REDISCOVERY and MORE TRUSTWORTHY FUTURE CHANGES.
