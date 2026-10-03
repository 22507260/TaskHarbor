# ADR 0005: Portable workflow definitions

Status: accepted.

Use an explicit format discriminator and formatVersion for portable JSON. Version 1 contains one workflow definition, with no persistence identity or execution data. Export the latest definition; import always creates a new workflow identity and revision 1. This avoids collisions and accidental modification of existing histories. This is definition transfer, not a backup or revision restoration format.

Reuse engine validation and refinement rules, but make portable documents strict at every schema level. Unknown fields may imply semantics an older engine cannot execute and must not be silently discarded. Preview normalizes defaults without writes. Creation revalidates independently and uses the existing transactional createWorkflow path. No migration is required.

The client bounds UTF-8 input/file size, offers file or paste input, shows a validated step summary and allows renaming before explicit creation. Server validation remains authoritative and the existing 64 KiB body limit applies. Export includes selectable text to support environments without a working download handler. Configured transform values remain part of the definition and should be reviewed before sharing. Each import is a deliberate new copy; import request deduplication and bulk archives are future work.
