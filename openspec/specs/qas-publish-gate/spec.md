# qas-publish-gate Specification

## Purpose

Verify publish preconditions (valid approval, passing cases validation, configured TCMS) and emit a gate token before TCMS upload.
## Requirements
### Requirement: Publish gate verification

The CLI SHALL provide `qaspec publish-gate --change <name>` that verifies, before any TCMS upload: the analyze approval state is `valid`, `qaspec validate cases` passes for the change, and the project config contains a usable `tcms` block. On success it SHALL print a gate token; on failure it SHALL exit non-zero listing every unmet precondition.

#### Scenario: All preconditions met

- **GIVEN** a change with valid approval, passing cases validation, and a configured `tcms` block
- **WHEN** `qaspec publish-gate --change <name>` runs
- **THEN** the command exits zero and prints a gate token

#### Scenario: Unmet preconditions are enumerated

- **GIVEN** a change with a stale approval and no `tcms` block
- **WHEN** the gate runs
- **THEN** the command exits non-zero
- **AND** the output lists both failures with the command that resolves each (`qaspec approve`, config edit)

### Requirement: Single-use change-scoped token

The gate token SHALL be scoped to the change and derived from the approved content hash plus a per-invocation nonce persisted in the change's `.openspec.yaml`. A new successful gate run SHALL replace the previous token, and any edit to the approved artifacts SHALL invalidate outstanding tokens via the changed content hash.

#### Scenario: Token invalidated by artifact edits

- **GIVEN** a gate token was issued and `testcases.md` was edited afterward
- **WHEN** the gate runs again
- **THEN** a new token is issued and the previous token is no longer the persisted one

### Requirement: Upload requires citing the gate token

Publish-phase instructions for `qaspec-pr-review` SHALL require running the gate before the publish summary and SHALL forbid the first Qase MCP call unless the agent cites the current gate token together with the user's confirmation. When the gate fails, the agent SHALL resolve the listed preconditions instead of proceeding.

#### Scenario: Upload preceded by gate and confirmation

- **WHEN** the user confirms publish after the summary halt
- **THEN** the agent's upload message cites the current gate token
- **AND** the first MCP call happens only in that message or later

#### Scenario: Gate failure blocks upload

- **WHEN** the gate exits non-zero during `/qsx:publish`
- **THEN** the agent does not invoke Qase MCP
- **AND** the agent reports the unmet preconditions and how to resolve them

