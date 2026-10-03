# Contributing and learning workflow

1. Choose one concrete user problem from the roadmap and open a feature issue with observable acceptance criteria.
2. Create a branch such as `feat/workflow-versioning` or `fix/lease-recovery`.
3. Explain persistence, concurrency and failure semantics before changing the engine.
4. Add behavioral tests for relevant failure cases. Use fake time for deterministic retries and real processes when process coordination matters.
5. Run `npm run check`, `npm run format:check` and `npm audit --audit-level=high`.
6. Include before/after behavior and relevant verification in the PR. Update API docs and the ADR when contracts or tradeoffs change.

For UI work, verify desktop and narrow layouts, keyboard operation, empty states, validation errors and API disconnection. Use real API data for screenshots. Keep runtime databases, payloads, credentials and logs out of Git.

Commits should describe real development units. Do not use empty commits, artificial daily changes or backdated history to simulate activity. A tested feature or well-explained bug fix is more useful portfolio evidence.
