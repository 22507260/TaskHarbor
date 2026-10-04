# Product and engineering roadmap

These are planned milestones, not completed capabilities. Each milestone should ship a usable increment, tests and a demo.

## v0.1 â€” Local workflow operations

Delivered: workflow creation, DAG validation, durable jobs, leased workers, retries, cancellation, dependency previews, run inspection and process integration tests.

## v0.2 â€” Everyday workflow authoring

- Delivered in v0.1.1: extracted client API/types, dialog, builder and revision history. Delivered in v0.1.3: extracted run inspector. Next: share validated contracts with the backend.
- Delivered in v0.1.1: edit and version workflows without changing historical runs, with conflict detection and revision inspection. Delivered in v0.1.7: field-level comparison of any two revisions. Delivered in v0.1.11: create a reviewed copy from a historical definition.
- Delivered in v0.1.5: versioned workflow import/export with validation and preview. Delivered in v0.1.6: live execution graphs with selected-step output and event inspection. Next: visual graph authoring.
- Delivered in v0.1.2: run search, status/workflow filters, anchored pagination and global dashboard metrics. Delivered in v0.1.3: rerun with edited input and source/latest definition selection. Delivered in v0.1.8: event search/group filters. Delivered in v0.1.9: server-side event search and anchored cursor pagination with separate detail polling.
- Browser automation in CI; keyboard and screen-reader review of the full console.
- Deliverable: create, revise and troubleshoot an onboarding workflow entirely from the UI.

## v0.3 â€” PostgreSQL and operational confidence

- Introduce explicit versioned migrations and a repository adapter contract.
- Implement PostgreSQL transactional claims and concurrent worker tests.
- Backoff jitter, lease metrics, graceful shutdown deadlines and fault-injection tests.
- Compare measured queue throughput and latency for SQLite and PostgreSQL, with reproducible workloads.
- Deliverable: documented recovery and scaling behavior with benchmark artifacts.

## v0.4 â€” Teams and security

- Authentication, workspace membership and scoped authorization.
- Tenant isolation and access-control tests on every API surface.
- Secret references with redaction, audit events and rate limits.
- Deliverable: two workspaces cannot read, execute or modify each other's resources.

## v0.5 â€” Useful integrations and scheduling

- Allowlisted HTTP tasks with SSRF protections, timeouts, bounded responses and explicit idempotency keys.
- Signed webhook triggers and scheduled runs with timezone/DST tests.
- Idempotent inbound events, dead-letter inspection and replay policies.
- Deliverable: a real opt-in integration that is safe to retry and inspect.

## v0.6 â€” Deployment and observability

- Containerized API/workers, managed PostgreSQL deployment and documented backups.
- OpenTelemetry traces, structured logs, queue/run metrics and alert examples.
- Server-sent events with replay cursors and reconnection behavior.
- Retention policies, storage quotas and an operator runbook.
- Deliverable: a reproducible hosted demo with a clearly documented operating envelope.

## Longer-term experiments

Conditional branches, approvals, sub-workflows, worker capabilities, fairness and per-workspace concurrency limits. Add these only after the simpler execution semantics are measured and stable.
