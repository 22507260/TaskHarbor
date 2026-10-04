# Changelog

## 0.1.11

- Open an editable new-workflow draft from any recorded revision.
- Preserve historical step settings and dependencies while excluding source identity/history.
- Suggest a bounded version-labelled copy name; create only after explicit draft submission.
- Test deep draft isolation and fresh-version creation without changing source workflows or runs.

## 0.1.10

- Navigate backward through execution-event pages while retaining the insertion boundary.
- Keep a revisited first page paused until explicit refresh, avoiding shifts caused by new events.
- Accept validated event snapshot boundaries and test first-page revisits in both sort directions.

## 0.1.9

- Move event search and filters into SQLite with bounded cursor pagination.
- Keep continuation pages inside an append-ID boundary in both sort directions.
- Poll the live first event page separately; omit events from repeated run-detail responses while preserving API defaults.
- Add loading/error states and a scrollable event panel with explicit refresh/continuation controls.
- Add five API/store tests for boundaries, Unicode/literal search, cursor validation and compatibility.

## 0.1.8

- Search execution events by message, type or step identity with Unicode normalization.
- Combine error/retry/recovery groups with graph step selection.
- Reverse event ordering and display matching/recorded counts and no-results states.
- Label event severity and progressively render matching events in batches of 50.
- Extract EventTrail and cover filtering, ordering, live additions and severity classification.

## 0.1.7

- Compare any two saved workflow definitions with reversible version selection.
- Show added, removed and modified steps, workflow metadata and step sequence changes.
- Render field-level before/after values with explicit missing/null distinction.
- Ignore object key order while preserving dependency order semantics.
- Cancel revision-history requests on dismissal and add four comparison tests.

## 0.1.6

- Add an interactive live dependency map to the run inspector.
- Select a step to inspect its attempts, worker, dependencies, errors and output.
- Filter the event trail to the selected step and restore it with clear selection.
- Show persisted retry eligibility times and keep large graphs inside a scrollable panel.
- Add inspector dialog semantics, keyboard focus containment and Escape dismissal.
- Test unsorted branching graphs, 20-step layouts and invalid graph rejection.

## 0.1.5

- Export latest workflow definitions in a strict versioned portable JSON format.
- Import files or pasted JSON through validation, preview, rename and explicit creation.
- Create fresh workflow identities and revision 1 without copying execution history.
- Reject unknown fields, unsupported formats, invalid graphs and oversized requests.
- Provide selectable JSON export text alongside downloading.
- Add four API/roundtrip tests and a portable example.

## 0.1.4

- Refresh the console with a live engine overview, stronger typography and layered surfaces.
- Highlight actual dependency maps and graph counts on workflow cards.
- Keep card accents stable across search results and add a clear no-results state.
- Improve responsive layout, navigation labels, keyboard focus and reduced-motion support.

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
