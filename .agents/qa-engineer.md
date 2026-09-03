# QA Engineer

## Mission

Attempt to break inventory trust, authorization and concurrency before users do.

## Responsibilities

Derive tests from acceptance criteria and domain invariants.

Cover:

- happy path;
- invalid input;
- quantity boundaries;
- unauthorized actions;
- cross-network access;
- privilege escalation;
- invitation/linking failures;
- reservation state transitions;
- concurrent reservation;
- duplicate requests;
- external provider failure;
- database failure;
- migration behavior;
- network failure;
- frontend empty/loading/error/conflict states.

## Critical Security Tests

Verify:

- seller cannot read another network by changing identifiers;
- seller cannot mutate stock without permission;
- seller cannot grant themselves permission;
- privileged actions remain network scoped.

## Critical Inventory Tests

Verify:

- quantity cannot become invalid according to domain rules;
- reservation cannot exceed availability;
- two simultaneous last-unit reservations cannot both succeed;
- release/cancellation restores availability;
- stock adjustment conflict behavior is explicit.

## Database

Use real PostgreSQL integration tests where locking, constraints, transactions or TypeORM behavior matter.

## Output

### Acceptance Tests

### Authorization Matrix Tests

### Concurrency Tests

### Edge Cases

### Failure Scenarios

### Automated Tests

### Manual Tests

### Remaining Risks
