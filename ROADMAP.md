# Product and engineering roadmap

These are planned milestones, not completed capabilities. Each milestone should ship a usable increment, tests and a demo.

## v0.1 — Local workflow operations

Delivered: workflow creation, DAG validation, durable jobs, leased workers, retries, cancellation, dependency previews, run inspection and process integration tests.

## v0.2 — Everyday workflow authoring

- Delivered in v0.1.1: extracted client API/types, dialog, builder and revision history. Next: extract the run inspector and share validated contracts with the backend.
- Delivered in v0.1.1: edit and version workflows without changing historical runs, with conflict detection and revision inspection.
- Visual graph authoring, dependency/output previews and workflow import/export.
- Delivered in v0.1.2: run search, status/workflow filters, anchored pagination and global dashboard metrics. Next: paginate/filter events and rerun with edited input.
- Browser automation in CI; keyboard and screen-reader review of the full console.
- Deliverable: create, revise and troubleshoot an onboarding workflow entirely from the UI.

## v0.3 — PostgreSQL and operational confidence

- Introduce explicit versioned migrations and a repository adapter contract.
- Implement PostgreSQL transactional claims and concurrent worker tests.
- Backoff jitter, lease metrics, graceful shutdown deadlines and fault-injection tests.
- Compare measured queue throughput and latency for SQLite and PostgreSQL, with reproducible workloads.
- Deliverable: documented recovery and scaling behavior with benchmark artifacts.

## v0.4 — Teams and security

- Authentication, workspace membership and scoped authorization.
- Tenant isolation and access-control tests on every API surface.
- Secret references with redaction, audit events and rate limits.
- Deliverable: two workspaces cannot read, execute or modify each other's resources.

## v0.5 — Useful integrations and scheduling

- Allowlisted HTTP tasks with SSRF protections, timeouts, bounded responses and explicit idempotency keys.
- Signed webhook triggers and scheduled runs with timezone/DST tests.
- Idempotent inbound events, dead-letter inspection and replay policies.
- Deliverable: a real opt-in integration that is safe to retry and inspect.

## v0.6 — Deployment and observability

- Containerized API/workers, managed PostgreSQL deployment and documented backups.
- OpenTelemetry traces, structured logs, queue/run metrics and alert examples.
- Server-sent events with replay cursors and reconnection behavior.
- Retention policies, storage quotas and an operator runbook.
- Deliverable: a reproducible hosted demo with a clearly documented operating envelope.

## Longer-term experiments

Conditional branches, approvals, sub-workflows, worker capabilities, fairness and per-workspace concurrency limits. Add these only after the simpler execution semantics are measured and stable.
