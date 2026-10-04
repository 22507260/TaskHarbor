# ADR 0006: Separate bounded event history from run detail

Status: accepted

## Context

The inspector previously transferred every execution event with each one-second run-detail poll. Client filtering bounded rendering but did not bound event transfer. Append-only events have a stable integer identity and an existing `(run_id, id)` index.

## Decision

Expose a separate event endpoint with literal Unicode search, category/step filters and a maximum of 50 rows. Seek by event ID in either direction. The first request captures the run's maximum event ID; each continuation carries that boundary and its last returned ID. Counts and rows are read in one SQLite read transaction. Timestamp ties cannot produce duplicates or omissions.

Bind cursor validation to the run and normalized query filters/order. Cursors are unsigned navigation values; they are not security boundaries. This local trusted-user release has no authorization layer. No schema migration is needed because the existing index supports the seek.

The console polls the first page every 1.5 seconds using sequential requests, but does not poll continuation pages. Refresh returns to the current first page; filter/order/step changes restart paging. Abort pending requests when the query changes or the inspector closes. Job state continues its independent one-second polling with events omitted. Keep full event detail as the default API response for compatibility.

## Consequences

Event response size and rendered rows are bounded independently of total history. Counts and substring filtering still scan matching run records; this does not establish unbounded-scale performance. The insertion boundary freezes event membership, not current job state. The console retains continuation cursors for previous-page navigation. Returning to the first page supplies the same snapshot boundary and stays paused; refresh starts a live traversal. Arbitrary page jumps remain unsupported.
