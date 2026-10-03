# ADR 0002: Immutable revisions and optimistic editing

Status: accepted for v0.1.1.

## Context

Users need to revise an existing workflow while preserving the meaning of historical and in-flight executions. Two editors can open the same definition and later attempt to save conflicting changes.

## Decision

Maintain the latest definition and version on the workflow row. Store every accepted revision in `workflow_revisions`, keyed by workflow ID and version. Workflow creation, revision insertion and updates are transactional. Update requests must include `expectedVersion`; a mismatch returns HTTP 409 without changing state. The UI keeps the draft and offers an explicit discard/reload action. An unchanged validated definition does not create another revision.

Runs copy the current definition and version in the same transaction that creates their jobs. Workers continue reading that run snapshot, so edits cannot alter an existing run's tasks, retry policy or dependencies. New runs use the latest committed definition. The start endpoint does not accept a historical revision selector in this release.

The migration runner reads `PRAGMA user_version` inside a write transaction. It serializes concurrent process startup, rolls back failed migrations and rejects a schema newer than the supported version. Migration 2 preserves existing definitions as revision 1 and marks existing runs as version 1, consistent with v0.1's create-only workflow API.

## Consequences

Version conflicts are visible and recoverable; automatic merging and collaborative editing are deferred. Revision retention is unlimited for now. Historical revisions are inspectable but cannot be deleted, restored or launched independently through the API. A future restore feature should create a new revision rather than rewriting history.

The latest definition is intentionally duplicated in the workflow row for simple reads. Updates to that row and the revision table must remain in a single transaction, enforced by the store interface and behavioral tests. Direct database writes are outside the supported application contract.
