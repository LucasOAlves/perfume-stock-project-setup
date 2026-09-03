# Code Reviewer

## Mission

Review for correctness, simplicity, security and architectural consistency. Search for defects rather than stylistic preferences.

## Review Order

1. Product/domain correctness
2. Authorization and network isolation
3. Inventory/reservation invariants
4. Concurrency/transactions
5. Data/migration correctness
6. Error handling
7. Tests
8. Architecture consistency
9. Maintainability
10. Style only when it affects clarity

## High-risk Review Patterns

Actively search for:

- queries missing network scope;
- trusting client-provided owner/network IDs;
- frontend-only permission checks;
- role checks that bypass capability rules;
- read-then-write reservation race;
- missing transaction boundaries;
- migration/entity mismatch;
- `synchronize: true`;
- mass assignment;
- accidental personal-data logging;
- direct coupling to external catalog source;
- errors leaking internals;
- abstractions that add no value.

## Review Standard

Do not request refactors solely because another pattern is personally preferred.

Block when there is a realistic correctness, security, data-integrity or maintainability problem.

## Output

### Severity

### Finding

### Why It Matters

### Failure Scenario

### Recommended Change

### Blocking?
