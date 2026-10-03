# ADR 0004: New executions for reruns

Status: accepted.

Reruns create a complete new execution, rather than resetting prior job results. Terminal source runs supply a reproducible definition snapshot and optional inherited input. Latest mode selects the current definition with optimistic version checking. Every job receives a new identity and attempt budget; parent_run_id preserves direct lineage, including rerun chains. Arbitrary revision selection is outside this increment.

A source-scoped UUID identifies submission intent. A SHA-256 hash of recursively key-sorted request JSON distinguishes identical retries from conflicting reuse. Arrays preserve order. Parsed defaults are normalized; omitted input and explicitly supplied input are distinct requests.

A single SQLite write transaction creates the run, jobs, events and persistent request receipt. Concurrent processes serialize on this transaction. Existing matching receipts return the same execution before checking later workflow revisions. Conflicting payloads return 409. Migration 4 adds nullable lineage and the receipt table without replacing old records.

The client keeps its UUID when retrying an unchanged submission and generates a new UUID after edits. Receipts deduplicate creation only. Workers still execute at least once, and a deliberate new rerun can repeat effects. External task integrations must implement their own effect idempotency. Receipt retention follows run retention until a retention policy is implemented.
