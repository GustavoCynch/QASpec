## MODIFIED Requirements

### Requirement: Analyze workflow behavior

The `qaspec-analyze` skill and `/qsx:analyze` command SHALL produce `analisis.md`, require reading `qaspec/references/historical_bugs.md`, honor `workflow.multipleSubagents.review` from `qaspec/config.yaml` (default **false** when unset), use dual blind analyst Task synthesis only when that flag is **true**, otherwise perform the analyze phase entirely in the orchestrator without Task subagents, include an **Affected capabilities** section in `analisis.md` using kebab-case names, SHALL NOT write `specs/**/*.md` in the analyze step, and end with exactly one halt question before matrix work in the same turn.

#### Scenario: Analyze references path

- **WHEN** the agent runs analyze for a project initialized by QASpec
- **THEN** instructions point to `qaspec/references/historical_bugs.md` using path.join-safe resolution from project root

#### Scenario: Analyze does not write specs

- **WHEN** analyze completes with a halt
- **THEN** `analisis.md` exists
- **AND** no new `specs/<capability>/spec.md` files are required from the analyze step alone

#### Scenario: Analyze persists clarifications for matrix

- **WHEN** the user answers the analyze halt or supplies clarifications after it
- **THEN** the agent updates `analisis.md` **Validated clarifications** (and intent vs implementation when needed)
- **AND** does not rely on chat-only text as the input for `/qsx:matrix`

#### Scenario: Dual analysts when review flag true

- **WHEN** `workflow.multipleSubagents.review` is **true** and the Task tool is available
- **THEN** the agent runs two parallel blind Task subagents with identical analyst briefs before writing user-visible `analisis.md`
- **AND** **Synthesis notes** document Agreed / Single-analyst / Contradiction merge

#### Scenario: Orchestrator-only when review flag false

- **WHEN** `workflow.multipleSubagents.review` is **false** or omitted (default)
- **THEN** the orchestrator fetches the change set and writes `analisis.md` without invoking Task subagents
- **AND** the workflow does not delegate to a single subagent as a substitute

### Requirement: Matrix workflow behavior

The `qaspec-matrix` skill and `/qsx:matrix` command SHALL produce `testmatrix.md` with mandatory checkboxes and, for each case, preconditions plus steps with action and expected result built from sources in hand, create or update change delta specs under `specs/**/*.md` in the same phase, read `qaspec/references/qase_test_case_rules.md`, read `openspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md` when present, treat user-validated `analisis.md` as the source of truth over PR diff or current implementation when they conflict, honor `workflow.multipleSubagents.matrix` from `qaspec/config.yaml` (default **false** when unset), use dual blind analyst Task synthesis for draft lists only when that flag is **true**, otherwise draft matrix and specs in the orchestrator without Task subagents, and halt once for human approval of **both** the case list and the requirements.

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

#### Scenario: Dual analysts when matrix flag true

- **WHEN** `workflow.multipleSubagents.matrix` is **true** and the Task tool is available
- **THEN** the agent runs two parallel blind Task subagents before merging drafts into `testmatrix.md` and delta specs

#### Scenario: Orchestrator-only when matrix flag false

- **WHEN** `workflow.multipleSubagents.matrix` is **false** or omitted (default)
- **THEN** the orchestrator drafts matrix and specs without Task subagents
- **AND** the workflow does not delegate to a single subagent as a substitute

## ADDED Requirements

### Requirement: Workflow skills document multipleSubagents config

Generated `qaspec-analyze` and `qaspec-matrix` skills SHALL instruct agents to read `workflow.multipleSubagents.review` and `workflow.multipleSubagents.matrix` from `qaspec/config.yaml` before choosing dual Task delegations versus orchestrator-only execution.

#### Scenario: Skill body mentions config keys

- **WHEN** `qaspec update` regenerates analyze and matrix skills
- **THEN** each skill body references `workflow.multipleSubagents` with review and matrix keys
- **AND** the skill states orchestrator-only behavior when the flag for that phase is false
