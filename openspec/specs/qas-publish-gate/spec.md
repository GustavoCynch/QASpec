# qas-publish-gate Specification

## Purpose

Verify publish preconditions (valid approval, passing cases validation, usable TCMS target) and emit a gate token before TCMS upload.
## Requirements
### Requirement: Publish gate verification

The CLI SHALL provide `qaspec publish-gate --change <name>` that verifies, before any TCMS upload: the analyze approval state is `valid`, `qaspec validate cases` passes for the change, and the change resolves a usable TCMS target (provider + project) from its `.qaspec.yaml` `tcms` block merged over project-config defaults. On success it SHALL print a gate token and the resolved target; on failure it SHALL exit non-zero listing every unmet precondition. Resolve hints for a missing target SHALL be provider-neutral: they SHALL point to `qaspec tcms set` without hardcoding a concrete `--provider` value.

#### Scenario: All preconditions met

- **GIVEN** a change with valid approval, passing cases validation, and a usable TCMS target in its `.qaspec.yaml`
- **WHEN** `qaspec publish-gate --change <name>` runs
- **THEN** the command exits zero and prints a gate token

#### Scenario: Project-config defaults satisfy the target

- **GIVEN** a change without a `tcms` block in its `.qaspec.yaml` and a project config whose `tcms` defaults include provider and project
- **WHEN** the gate runs
- **THEN** the TCMS precondition passes using the config defaults

#### Scenario: Unmet preconditions are enumerated

- **GIVEN** a change with a stale approval and no resolvable TCMS target
- **WHEN** the gate runs
- **THEN** the command exits non-zero
- **AND** the output lists both failures with the command that resolves each (`qaspec approve`, `qaspec tcms set`)

#### Scenario: Missing-target hint is provider-neutral

- **GIVEN** a change that resolves no usable TCMS target
- **WHEN** the gate emits its `tcms-missing` resolve hint
- **THEN** the hint references `qaspec tcms set` without a hardcoded concrete `--provider` value
- **AND** the message names no specific TCMS product as the required provider

### Requirement: Single-use change-scoped token

The gate token SHALL be scoped to the change and derived from the approved content hash plus a per-invocation nonce persisted in the change's `.qaspec.yaml`. A new successful gate run SHALL replace the previous token, and any edit to the approved artifacts SHALL invalidate outstanding tokens via the changed content hash.

#### Scenario: Token invalidated by artifact edits

- **GIVEN** a gate token was issued and `testcases.md` was edited afterward
- **WHEN** the gate runs again
- **THEN** a new token is issued and the previous token is no longer the persisted one

### Requirement: Upload requires citing the gate token

Publish-phase instructions for `qaspec-pr-review` SHALL require running the gate before the publish summary and SHALL forbid the first TCMS MCP call unless the agent cites the current gate token together with the user's confirmation. When the gate fails, the agent SHALL resolve the listed preconditions instead of proceeding.

#### Scenario: Upload preceded by gate and confirmation

- **WHEN** the user confirms publish after the summary halt
- **THEN** the agent's upload message cites the current gate token
- **AND** the first MCP call happens only in that message or later

#### Scenario: Gate failure blocks upload

- **WHEN** the gate exits non-zero during `/qsx:publish`
- **THEN** the agent does not invoke the provider's TCMS MCP
- **AND** the agent reports the unmet preconditions and how to resolve them

