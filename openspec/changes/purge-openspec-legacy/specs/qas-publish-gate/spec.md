## MODIFIED Requirements

### Requirement: Publish gate verification

The CLI SHALL provide `qaspec publish-gate --change <name>` that verifies, before any TCMS upload: the analyze approval state is `valid`, `qaspec validate cases` passes for the change, and the change resolves a usable TCMS target (provider + project) from its `.qaspec.yaml` `tcms` block merged over project-config defaults. On success it SHALL print a gate token and the resolved target; on failure it SHALL exit non-zero listing every unmet precondition.

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

### Requirement: Single-use change-scoped token

The gate token SHALL be scoped to the change and derived from the approved content hash plus a per-invocation nonce persisted in the change's `.qaspec.yaml`. A new successful gate run SHALL replace the previous token, and any edit to the approved artifacts SHALL invalidate outstanding tokens via the changed content hash.

#### Scenario: Token invalidated by artifact edits

- **GIVEN** a gate token was issued and `testcases.md` was edited afterward
- **WHEN** the gate runs again
- **THEN** a new token is issued and the previous token is no longer the persisted one
