## MODIFIED Requirements

### Requirement: Publish workflow behavior

The `qaspec-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, read completed `specs/**/*.md` for context before MCP when files exist, resolve Qase prerequisites from existing artifacts or one halt question, write or update `execution-context.md` and `publish-plan.md` for user review, halt once for the user to edit those files or confirm publish, and only after explicit confirmation validate the matrix, call Qase via MCP when configured, write `publish-log.md`, and mark published rows in `testmatrix.md`.

#### Scenario: Prerequisites before MCP

- **WHEN** required Qase fields are missing from artifacts and chat context
- **THEN** the agent stops with one question listing only missing fields
- **AND** does not invoke Qase MCP until fields are provided

#### Scenario: Publish blocked without specs

- **WHEN** `testmatrix.md` exists but no files exist under the change `specs/` directory and the schema apply phase requires `specs`
- **THEN** the agent does not invoke Qase MCP
- **AND** the agent directs the user to complete `/qsx:matrix` (or author deltas) before publish

#### Scenario: Prepare files before TCMS upload

- **WHEN** Qase prerequisites are known or collected and the matrix is approved
- **THEN** the agent writes or updates `execution-context.md` with project code, role, and base URL
- **AND** the agent writes `publish-plan.md` summarizing suites and cases to create from `testmatrix.md` (unchecked rows only)
- **AND** the agent does not invoke Qase MCP in the same message

#### Scenario: Single halt before publish

- **WHEN** `execution-context.md` and `publish-plan.md` are ready for review
- **THEN** the agent asks exactly one question for the user to edit those files or confirm publish
- **AND** the agent does not call Qase MCP until the user confirms

#### Scenario: MCP only after confirmation

- **WHEN** the user confirms publish after the prepare-and-halt step
- **THEN** the agent re-reads `execution-context.md`, `publish-plan.md`, and `testmatrix.md`
- **AND** the agent invokes Qase MCP, writes `publish-log.md`, and marks each published row `- [x]` in `testmatrix.md`

#### Scenario: User edits plan before confirm

- **WHEN** the user requests changes to Qase targets or case scope after the publish halt
- **THEN** the agent updates `execution-context.md` and/or `publish-plan.md` in chat
- **AND** asks again for confirm before MCP
