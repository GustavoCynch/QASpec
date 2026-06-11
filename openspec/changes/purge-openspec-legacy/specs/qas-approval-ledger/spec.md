## MODIFIED Requirements

### Requirement: Phase approval recording

The CLI SHALL provide `qaspec approve analyze --change <name>` that records the user's approval of the analyze-phase artifacts in the change's `.qaspec.yaml` under `approvals.analyze`, including the approval timestamp and a content hash covering `analysis.md` and all change `specs/**/*.md` files. When the agent supplies `--head-sha <sha>`, the record SHALL also store the analyzed PR head SHA.

#### Scenario: Approval recorded after the analyze halt

- **WHEN** the user approves the analyze digest and the agent runs `qaspec approve analyze --change <name> --head-sha <sha>`
- **THEN** `.qaspec.yaml` in the change directory contains an `approvals.analyze` record with timestamp, content hash, and head SHA
- **AND** the command output confirms which artifacts the hash covers

#### Scenario: Cross-platform deterministic hash

- **WHEN** the same artifact contents are approved on Windows and on macOS/Linux
- **THEN** the recorded content hash is identical
- **AND** path separators and line endings do not change the hash
