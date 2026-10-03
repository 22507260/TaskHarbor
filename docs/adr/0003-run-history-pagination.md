# ADR 0003: Bounded history summaries with anchored keyset pagination

Status: accepted for v0.1.2.

## Context

Loading the newest 100 full runs makes older records inaccessible, transfers unused inputs/outputs and incorrectly limits dashboard statistics to that window. New executions can also move offset-based page boundaries while a user browses.

## Decision

Preserve the legacy `/runs` array endpoint and introduce `/run-history` for bounded summaries. Filter by historical workflow name or run ID, exact workflow ID and run status. Text matching uses literal substrings with Unicode NFKC/lowercase normalization, not SQL wildcard interpretation. Queries bind values as parameters.

Order by creation timestamp and ID, both descending; IDs break timestamp ties deterministically. A cursor stores the final row's timestamp/ID and an insertion boundary (maximum run rowid). Later pages exclude records inserted after that boundary, including late inserts with older timestamps. Cursors carry their filter fingerprint and are rejected when reused with other filters. Their base64 encoding is a transport format, not encryption or authorization.

Previous-page navigation keeps the visited cursor stack and the same insertion boundary. First-page polling is live until the user browses older pages. **Refresh latest** resets the boundary and stack. Statuses remain live: this is an insertion boundary, not an immutable point-in-time snapshot of execution state. Status-filter results and totals may change as workers progress; an older page may become empty, in which case previous/refresh controls remain available.

Count and page reads use a deferred read transaction for a consistent response without acquiring a write lock. Migration 3 adds chronological, workflow and status indexes. Queries return step counts and success counts, omitting task bodies, inputs and outputs. Selecting a row fetches its full details. `/overview` computes global counts and latest workflow states independently of pagination.

The history UI cancels requests when filters/page change, avoids overlapping poll requests and retains the last page on a transient refresh failure. Search is debounced for 300ms. Filters reset navigation to the first page. History and table components are separate from the app shell.

## Consequences

Keyset navigation does not provide arbitrary page jumps. Search is currently a scan over historical names, suitable for the local scale; full-text indexing should follow measured need. Counts and overview remain global aggregates. Unicode normalization is not locale-specific linguistic collation. Run rows are append-only through the supported API; future retention/deletion needs a cursor policy that addresses rowid reuse.

A future multi-user release must scope history, counts and cursors to workspace authorization. None of these cursor fields grants access rights.
