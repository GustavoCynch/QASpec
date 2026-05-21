## MODIFIED Requirements

### Requirement: Matrix workflow behavior

The `qaspec-matrix` skill and `/qsx:matrix` command SHALL produce `testmatrix.md` with mandatory checkboxes and, for each case, preconditions plus steps with action and expected result built from sources in hand, create or update change delta specs under `specs/**/*.md` in the same phase, read `qaspec/references/qase_test_case_rules.md`, read `openspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md` when present, treat user-validated `analisis.md` as the source of truth over PR diff or current implementation when they conflict, and halt once for human approval of **both** the case list and the requirements.

#### Scenario: Matrix format

- **WHEN** matrix output is written
- **THEN** each test case is a single `- [ ]` line with observable title text under a `##` suite heading
- **AND** immediately below that line the case includes **Preconditions** and **Steps** blocks per the schema template

#### Scenario: Co-produced delta specs

- **WHEN** the agent completes a matrix phase turn before the halt
- **THEN** the change contains or updates at least one `specs/<capability>/spec.md` delta when the change introduces or modifies testable behavior
- **AND** requirements and scenarios stay aligned with cases in `testmatrix.md`

#### Scenario: Single halt for matrix and specs

- **WHEN** the matrix phase ends awaiting user approval
- **THEN** the agent asks exactly one question covering approval of the matrix and the specs together
- **AND** the agent does not start publish or Qase MCP in the same message

#### Scenario: analisis.md overrides diff in matrix phase

- **WHEN** the agent runs the matrix phase and `analisis.md` documents expected behavior or a known defect that differs from the PR diff or current code
- **THEN** the agent reads `analisis.md` in full before fetching the change set
- **AND** matrix cases and delta specs reflect `analisis.md`, not accidental implementation
- **AND** known defects are tested as corrected behavior, not encoded as accepted SHALL/MUST requirements

#### Scenario: Chat iteration updates both artifacts

- **WHEN** the user requests case or requirement changes after the initial matrix draft
- **THEN** the agent updates `testmatrix.md` and affected `specs/**/*.md` in the same conversation without requiring a separate slash command

#### Scenario: Matrix iteration updates analysis when behavior agreement changes

- **WHEN** the user clarifies defect vs expected behavior or other agreed facts after matrix draft
- **THEN** the agent updates `analisis.md` (especially **Validated clarifications**) before updating `testmatrix.md` and affected `specs/**/*.md`

#### Scenario: No invented vague steps

- **WHEN** the agent drafts case steps
- **THEN** each action and expected result uses concrete UI labels, URLs, data, or API behavior found in sources read for this change
- **AND** generic placeholder steps are used only when sources lack actionable detail
- **AND** the agent self-audits before halt that no step is untraceable to a source unless marked as a documented gap

## MODIFIED Requirements

### Requirement: Publish workflow behavior

The `qaspec-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, read completed `specs/**/*.md` for context before MCP when files exist, resolve Qase prerequisites from existing artifacts or one halt question, write or update `execution-context.md` and `publish-plan.md` for user review using preconditions and steps from each case block in `testmatrix.md`, halt once for the user to edit those files or confirm publish, and only after explicit confirmation validate the matrix, call Qase via MCP when configured, write `publish-log.md`, and mark published rows in `testmatrix.md`.

#### Scenario: Prerequisites before MCP

- **WHEN** required Qase fields are missing from artifacts and chat context
- **THEN** the agent stops with one question listing only missing fields
- **AND** does not invoke Qase MCP until fields are provided

#### Scenario: Missing specs blocks publish

- **WHEN** `testmatrix.md` exists but no files exist under the change `specs/` directory and the schema apply phase requires `specs`
- **THEN** the agent stops and directs the user to complete `/qsx:matrix` first
- **AND** does not invoke Qase MCP

#### Scenario: Prepare artifacts before confirm

- **WHEN** the publish workflow runs the prepare step
- **THEN** the agent writes or updates `execution-context.md` and `publish-plan.md` from approved matrix content including each case's **Preconditions** and **Steps**
- **AND** the agent ends with exactly one confirmation halt before MCP

#### Scenario: MCP after confirm

- **WHEN** the user explicitly confirms publish after the prepare halt
- **THEN** the agent maps matrix case blocks to Qase fields per `qase_test_case_rules.md`
- **AND** the agent does not replace matrix steps with newly invented steps based only on titles
