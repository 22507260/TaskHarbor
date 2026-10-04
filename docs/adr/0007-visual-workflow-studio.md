# ADR 0007: Controlled visual authoring with origin-local presentation and drafts

Status: accepted

## Decision

Use React Flow as the controlled canvas renderer. The workflow definition remains authoritative: edges are derived from target dependency arrays. Presentation positions/camera, raw JSON text and operation history are editor state, not execution semantics. Share the existing Zod workflow schema between the browser and server; the server still validates every save.

Keep the latest 100 edit snapshots, with field edits committed at blur and node drags at completion. Undo/redo preserve the current camera. Node dimensions are measured view data and are retained separately from definition/history. Manual dependency order remains explicit because it controls output merge precedence.

Store versioned drafts in origin-local browser storage after 500 ms and flush on closing. Separate new, workflow-edit and source-version-copy keys. Validate recovered envelopes and graph references without requiring raw JSON to be finished. Preserve the original edit version and rely on optimistic server updates; stale drafts require a new copy or an explicit discard/reload. A successful server save clears the draft before returning to the workspace. Storage errors must not turn a successful creation into a repeat submission.

Store positions/camera per saved workflow locally. Definition saves omit presentation fields, retaining no-op version behavior. API routes, SQLite schema and portable JSON v1 remain unchanged. Importing or changing browser origin uses automatic layout. The editor module and React Flow styles load only when opened.

## Consequences

Drafts are local convenience data, not server backups or multi-user collaboration. They can include configured values and are not encrypted. Browser clearing/quota/privacy restrictions can remove or deny them; errors are surfaced. Copying definitions does not copy source presentation/history. One new-workflow draft is retained per origin. No automatic conflict merge or restore-over-source operation is added.

The browser suite builds the production bundle, uses an isolated temporary database and real worker, and runs on Linux CI. Unit/API checks remain on both Windows and Linux. Full screen-reader auditing is still future work.
