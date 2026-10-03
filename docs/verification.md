# v0.1 verification

Local verification performed on Windows with Node 24.21.0.

- Eleven automated tests passed, including an integration test that starts two real worker processes and observes simultaneous independent jobs.
- TypeScript checking and the Vite production build passed.
- Prettier checking passed; npm audit reported zero known vulnerabilities at verification time.
- Browser: created a two-step Customer onboarding workflow, saved it, launched it and observed both steps succeed with the configured merged JSON field.
- Browser: Resilient delivery failed twice, persisted 1000ms and 2000ms retry delays, then completed its third attempt and downstream receipt step.
- Browser: checked the console at 1440×1000 and 390×844. At the narrow size, document width equalled viewport width; the execution table scrolls within its own container.
- Browser: opened the production-built client served by Fastify and verified API-backed workflows and run history.

Screenshots contain real local API results with synthetic demonstration payloads. The extra Customer onboarding workflow was created during browser verification and is not part of the three default seed definitions.

The checked-in CI workflow targets Windows and Linux. Its remote execution status must be read from GitHub Actions; local success alone does not establish a green hosted build.

![Run inspector with persisted retries](images/run-inspector.jpg)

## v0.1.1 verification

- Eighteen automated tests cover the existing engine plus revision immutability, active-run isolation, stale API writes, no-op/invalid edits, migration/reopen preservation, unsupported versions, atomic migration rollback and concurrent editor processes.
- Browser verification with two simultaneous editor tabs: the first save created revision 2; the second stale save was rejected with a visible conflict while retaining its draft. Explicit reload replaced it with the latest definition.
- Version history displayed revisions 2 and 1. A subsequent run identified workflow v2 while the old execution remained v1.
- The migrated local database retained existing workflows, runs and event history.
