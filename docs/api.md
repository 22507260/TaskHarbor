# API v0.1.1

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

Step IDs must be unique, match `[a-z][a-z0-9_-]{0,39}` and refer to an acyclic graph. Definitions contain 1–20 steps. `maxAttempts` is 1–5 (default 3). Delays are 0–15000ms. Checkpoints deliberately fail until the configured attempt; they do not invoke an external service. Transform fields contain JSON primitive values.

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
