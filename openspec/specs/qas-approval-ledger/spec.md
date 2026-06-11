# qas-approval-ledger Specification

## Purpose

Record and verify human approval of analyze-phase artifacts so later workflow phases can detect stale or missing sign-off before proceeding.
## Requirements
### Requirement: Phase approval recording

The CLI SHALL provide `qaspec approve analyze --change <name>` that records the user's approval of the analyze-phase artifacts in the change's `.openspec.yaml` under `approvals.analyze`, including the approval timestamp and a content hash covering `analysis.md` and all change `specs/**/*.md` files. When the agent supplies `--head-sha <sha>`, the record SHALL also store the analyzed PR head SHA.

#### Scenario: Approval recorded after the analyze halt

- **WHEN** the user approves the analyze digest and the agent runs `qaspec approve analyze --change <name> --head-sha <sha>`
- **THEN** `.openspec.yaml` in the change directory contains an `approvals.analyze` record with timestamp, content hash, and head SHA
- **AND** the command output confirms which artifacts the hash covers

#### Scenario: Cross-platform deterministic hash

- **WHEN** the same artifact contents are approved on Windows and on macOS/Linux
- **THEN** the recorded content hash is identical
- **AND** path separators and line endings do not change the hash

### Requirement: Approval status verification

`qaspec status --change <name> --json` SHALL report an `approval` block for changes using the `qaspec-pr-review` schema, with state `valid` when the recorded hash matches the current artifacts, `stale` when artifacts or the supplied head SHA differ from the record, and `missing` when no record exists. Stale results SHALL state the reason (content changed vs head moved).

#### Scenario: Valid approval

- **GIVEN** `approvals.analyze` was recorded and the artifacts are unchanged
- **WHEN** `qaspec status --change <name> --json` runs
- **THEN** the JSON contains `approval.analyze: "valid"`

#### Scenario: Stale after artifact edit

- **GIVEN** `analysis.md` or any change `specs/**/*.md` file changed after approval
- **WHEN** status runs
- **THEN** the approval state is `stale` with reason `content-changed`

#### Scenario: Stale after PR head moves

- **GIVEN** an approval record with a head SHA
- **WHEN** status runs with `--head-sha` pointing to a different commit
- **THEN** the approval state is `stale` with reason `head-moved`

#### Scenario: Missing on legacy changes

- **GIVEN** a change created before this capability with no `approvals` key
- **WHEN** status runs
- **THEN** the approval state is `missing`
- **AND** the command succeeds without error

### Requirement: Cases phase blocked on unverified approval

Cases-phase instructions for `qaspec-pr-review` SHALL require checking the approval state before drafting and SHALL direct the agent to halt and request re-approval when the state is `stale` or `missing`, instead of consuming the artifacts as validated.

#### Scenario: Drift detected at cases start

- **WHEN** the agent starts `/qsx:cases` and `approval.analyze` is `stale` or `missing`
- **THEN** the agent reports what changed (content or PR head) and asks the user to re-approve via the analyze halt
- **AND** the agent does not draft `testcases.md` in that message

