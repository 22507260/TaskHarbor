# ADR 0001: Start with a durable local execution engine

Status: accepted for v0.1.

## Context

The first release must be easy to demonstrate on a developer machine while exposing real backend engineering: persistence, concurrency, failure recovery and testable state transitions. The current environment has Node 24 and does not require Docker or a database service.

## Decision

Use React and TypeScript for the client, Fastify and ESM JavaScript for the API/worker, Zod for runtime validation and `node:sqlite` for storage. The lockfile pins dependencies. Run API and workers as separate processes sharing a WAL database. Keep execution state transitions in `Store`; task functions do not own queue persistence.

A short write transaction claims a job and records its token. Workers renew a five-second lease once per second. Recovery consumes another attempt; exhausted jobs fail. Completion requires the matching, unexpired token. Dependent steps become queued only after all predecessors succeed. Failed predecessors skip dependent descendants while unrelated branches continue. Run definitions are snapshotted at launch.

## Consequences

Local setup is two commands and recovery behavior can be tested without infrastructure. SQLite writes are serialized; a single API process performs synchronous queries. This is not a claim of multi-host availability or high throughput. Node 24's SQLite API remains experimental. No production deployment is implied by this release.

The worker is at-least-once. Tokens fence stored results but cannot fence remote effects. Future HTTP/connector tasks need idempotency and cancellation semantics. Lease durations and renewal intervals will become configurable only alongside tests proving the relationship between them.

PostgreSQL becomes the production adapter in v0.3. Its `SKIP LOCKED` row locking is suitable for queue consumers, but changes to storage must retain behavioral tests for claims, recovery, fencing and dependency transitions.

## References

- [Node 24 SQLite documentation](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [SQLite WAL](https://sqlite.org/wal.html)
- [PostgreSQL SELECT locking](https://www.postgresql.org/docs/current/sql-select.html)
