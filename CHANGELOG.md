# Changelog

## 0.1.3

- Rerun terminal executions with edited JSON input and source/latest workflow selection.
- Preserve source results and link new executions to their parent run.
- Deduplicate concurrent rerun requests transactionally; reject reused keys with different payloads.
- Detect stale latest-version selections and offer reload without losing edited input.
- Add schema migration 4 and seven tests, including concurrent real processes.
- Extract the run inspector into a separate component.

## 0.1.2

- Search historical runs by workflow name or ID and combine workflow/status filters.
- Add compact summary responses and anchored cursor pagination with previous/next navigation.
- Compute dashboard statistics over all stored runs instead of the latest 100.
- Fetch full payloads only when opening a run; keep the legacy list API compatible.
- Add history indexes through schema migration 3 and document cursor semantics.
- Cancel stale history requests and avoid overlapping polling.
- Fix duplicate detail requests caused by table button clicks bubbling to their row.

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
