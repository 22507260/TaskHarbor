# API v0.1.5

Base URL: `http://127.0.0.1:4310/api`. JSON requests and responses. Local trusted-user API; no authentication in this release. Request bodies are limited to 64 KiB. Validation errors return `400`, unknown resources `404`, disallowed browser origins `403`.

| Method | Route                 | Behavior                                                            |
| ------ | --------------------- | ------------------------------------------------------------------- |
| GET    | `/health`             | Version and API readiness (not worker health)                       |
| GET    | `/workflows`          | Workflow definitions                                                |
| POST   | `/workflows`          | Validate and create a definition, returns `201`                     |
| POST   | `/workflows/:id/runs` | Start a snapshotted run with `{ "input": {} }`, returns `201`       |
| GET    | `/runs`               | Latest 100 runs, step state included, event arrays omitted          |
| GET    | `/runs/:id`           | Definition, input, jobs and ordered event history                   |
| POST   | `/runs/:id/cancel`    | Cancel eligible jobs and invalidate leases; terminal runs unchanged |
| GET    | `/workers`            | Worker labels, last heartbeat and online state                      |

Example workflow request:

```json
{
  "name": "Welcome preparation",
  "description": "Prepare and check a customer payload.",
  "steps": [
    {
      "id": "prepare",
      "name": "Prepare",
      "type": "transform",
      "config": { "fields": { "prepared": true } }
    },
    {
      "id": "check",
      "name": "Check",
      "type": "checkpoint",
      "dependsOn": ["prepare"],
      "config": { "delayMs": 500, "failUntilAttempt": 1 },
      "maxAttempts": 3
    }
  ]
}
```

Step IDs must be unique, match `[a-z][a-z0-9_-]{0,39}` and refer to an acyclic graph. Definitions contain 1â€“20 steps. `maxAttempts` is 1â€“5 (default 3). Delays are 0â€“15000ms. Checkpoints deliberately fail until the configured attempt; they do not invoke an external service. Transform fields contain JSON primitive values.

Run states: `queued`, `running`, `succeeded`, `failed`, `cancelled`. A run remains `running` during retry backoff. Job states additionally include `blocked` and `skipped`; retrying jobs are `queued` with a future `available_at`. Events carry a monotonically increasing database ID, type, step ID and creation timestamp. Worker records remain visible after going offline.

## Workflow revisions

`GET /workflows/:id` returns the current definition with `id` and `version`. `GET /workflows/:id/revisions` returns revisions newest first, each with `version`, `created_at` and `definition`.

`PUT /workflows/:id` accepts the same definition fields as creation plus the required positive integer `expectedVersion`. A changed definition creates the next revision and returns HTTP 200; an unchanged definition returns the existing version. A stale base version returns HTTP 409 and leaves the history untouched. Reload the latest definition before retrying.

```json
{
  "expectedVersion": 1,
  "name": "Revised workflow",
  "description": "",
  "steps": [
    {
      "id": "prepare",
      "name": "Prepare",
      "type": "transform",
      "config": { "fields": { "prepared": true } }
    }
  ]
}
```

Each run exposes `workflow_version` alongside its copied definition. Starting a run selects the latest committed version transactionally; editing a workflow never changes an already-created run. Historical revision selection is not supported by the start endpoint.

## Search and paginate run history

`GET /run-history` returns `{items, total, snapshot, nextCursor}`. Each item contains run identity, historical `workflow_name`, version, state, creation/finish timestamps, `step_count` and `completed_steps`. Inputs, task definitions, outputs and events are excluded; load `/runs/:id` for details.

| Parameter    | Behavior                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `limit`      | Integer 1â€“50, default 10                                                                       |
| `q`          | Literal name/ID substring, trimmed, maximum 100 characters; Unicode NFKC/lowercase normalization |
| `status`     | `queued`, `running`, `succeeded`, `failed` or `cancelled`                                        |
| `workflowId` | Exact workflow ID                                                                                |
| `cursor`     | Opaque continuation from `nextCursor`; use the same filters                                      |
| `snapshot`   | Optional insertion boundary returned by a prior response; used when revisiting the first page    |

Results sort by `created_at DESC, id DESC`. `total` counts all matches within the insertion boundary, not only the current page. A null `nextCursor` indicates no more records. Invalid bounds, malformed cursors or cursors reused with different filters return HTTP 400. Cursor values are not credentials. No arbitrary page jumps are provided.

Example: `/run-history?limit=5&status=failed&q=delivery`. Continue by adding the returned cursor and keeping the filters. New records are excluded from continuation pages; refreshing without cursor/snapshot starts a live first page. Job states and status-filter membership remain live.

`GET /overview` returns global `total`, `active`, `succeeded`, `completed` and `latestByWorkflow` states. `completed` includes only succeeded and failed runs; use it as the success-rate denominator. This endpoint is independent of history filters and the legacy 100-run window.

## Rerun a terminal execution

`POST /runs/:id/rerun` accepts a strict JSON object:

```json
{
  "requestId": "c1fd5ba8-6c61-4b58-91bb-524018b6fcef",
  "mode": "latest",
  "expectedVersion": 2,
  "input": { "customer": "demo" }
}
```

`requestId` is a required UUID scoped to the source run. `mode` defaults to `source`; `latest` requires a positive `expectedVersion`. Omitted `input` copies the source input; supplied input must be a JSON object. Source mode uses the exact stored run snapshot. Latest mode checks and snapshots the current workflow atomically.

Only succeeded, failed and cancelled sources are eligible. New creation returns `201` with the full run; an identical repeated request returns `200` with that run's current state. A changed payload using the same key, active source or stale latest version returns `409`. Missing source returns `404`; invalid requests return `400`. Receipt lookup precedes version checking, so a successful request can be retried after later workflow edits.

Runs and history summaries expose nullable `parent_run_id`. New jobs start at attempt zero. The original run, jobs and events remain unchanged. Each rerun adds a `run.rerun` event to its new event trail.

## Portable workflow documents

`GET /workflows/:id/export` returns the latest definition in a portable document. Missing workflows return 404. The response excludes workflow ID, database version, revisions and all execution records.

```json
{
  "format": "taskharbor.workflow",
  "formatVersion": 1,
  "workflow": {
    "name": "Portable example",
    "description": "",
    "steps": [{ "id": "prepare", "name": "Prepare", "type": "transform" }]
  }
}
```

`POST /workflow-imports/preview` validates this document and returns its normalized form with defaults, without writing data. `POST /workflow-imports` independently revalidates it and creates a fresh workflow at revision 1, returning 201. Names may match existing workflows; repeat imports create new copies. No runs are started. Unknown keys at document, workflow, step and config levels are rejected rather than silently dropped. Only format version 1 and existing bounded built-in tasks are accepted; DAG validation applies. Invalid JSON/documents return 400 and requests over 64 KiB return 413.
