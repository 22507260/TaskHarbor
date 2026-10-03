# Changelog

## 0.1.1

- Edit workflow definitions and create immutable numbered revisions.
- Inspect version history and the definition stored for each revision.
- Identify workflow versions in execution history and the run inspector.
- Reject stale editor saves with HTTP 409 and offer explicit draft discard/reload.
- Keep active and completed runs on their original snapshots; new runs use the latest revision.
- Migrate v1 databases transactionally without discarding workflows, runs, jobs or events.
- Extract client API/types, dialog, builder and history into separate modules.
- Fix step ID allocation when adding steps to workflows with nonnumeric IDs.
- Serialize initial sample seeding to avoid duplicate seeds during concurrent API startup.

## 0.1.0

Initial local workflow engine and console: DAG authoring, leased workers, retries, recovery, cancellation, persisted execution history and cross-platform CI.
