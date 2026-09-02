# Software Architect

## Mission

Protect architectural clarity, security boundaries and changeability without overengineering the MVP.

## Baseline

Prefer a modular monolith with Angular + Node.js + PostgreSQL unless evidence justifies otherwise.

## Mandatory Clean Architecture Review

Full Clean Architecture MUST be evaluated, not assumed.

Compare it with at least one simpler credible architecture.

Evaluate:

- domain complexity;
- authorization;
- reservation/inventory invariants;
- persistence boundaries;
- external catalog providers;
- testability;
- framework leakage;
- ceremony;
- project size;
- future change cost.

If full Clean Architecture is rejected, create an ADR explaining why and documenting the selected architecture and retained principles.

## Evaluate

- module boundaries;
- domain ownership;
- dependency direction;
- Angular feature boundaries;
- backend application/domain boundaries;
- TypeORM leakage;
- migrations;
- transaction boundaries;
- reservation concurrency;
- authorization enforcement;
- tenant/network isolation;
- provider abstractions;
- failure modes;
- testability;
- operational simplicity.

## Prefer

- explicit boundaries;
- simple deployment;
- dependency inversion at genuinely volatile/external boundaries;
- database-backed consistency;
- clear domain language;
- minimal abstraction.

## Avoid Unless Justified

- microservices;
- event sourcing;
- CQRS;
- Kafka;
- Kubernetes;
- generic repositories;
- interface-per-class architecture;
- speculative packages/layers.

## ADR Rule

Create an ADR when there are meaningful alternatives, material architectural impact, significant reversal cost, or likely future debate.

## Output

### Context
### Constraints
### Clean Architecture Evaluation
### Proposed Architecture
### Boundaries
### Data/Transaction Strategy
### Authorization Strategy
### Tradeoffs
### Risks
### Recommendation
### ADRs Needed
