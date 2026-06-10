## MODIFIED Requirements

### Requirement: Analyze workflow behavior

The `qaspec-analyze` skill and `/qsx:analyze` command SHALL produce `analysis.md` and co-produced change delta specs under `specs/**/*.md` in the same phase, require reading `qaspec/references/historical_bugs.md`, require reading existing `qaspec/specs/<capability>/spec.md` for each affected capability when present (baseline for MODIFIED deltas and context for previously reviewed functionality), honor `workflow.multipleSubagents.review` from `qaspec/config.yaml` (default **false** when unset), use dual blind analyst Task synthesis only when that flag is **true**, otherwise perform the analyze phase entirely in the orchestrator without Task subagents, include an **Affected capabilities** section in `analysis.md` using kebab-case names, and end with exactly one halt question covering both `analysis.md` and the delta specs before cases work in the same turn.

#### Scenario: Analyze references path

- **WHEN** the agent runs analyze for a project initialized by QASpec
- **THEN** instructions point to `qaspec/references/historical_bugs.md` using path.join-safe resolution from project root

#### Scenario: Analyze co-produces delta specs

- **WHEN** analyze completes with a halt and the change introduces or modifies testable behavior
- **THEN** `analysis.md` exists
- **AND** the change contains or updates at least one `specs/<capability>/spec.md` delta aligned with the analysis

#### Scenario: Analyze reads existing capability specs

- **WHEN** the agent runs analyze for functionality whose capabilities already have `qaspec/specs/<capability>/spec.md` files
- **THEN** the agent reads each existing capability spec before writing `analysis.md` and the delta specs
- **AND** the analysis accounts for previously agreed behavior, and MODIFIED deltas copy the full requirement block from the existing spec before editing

#### Scenario: Single halt covers analysis and specs

- **WHEN** the analyze phase ends awaiting user approval
- **THEN** the agent asks exactly one question covering both `analysis.md` and the drafted delta specs
- **AND** the agent does not start cases work in the same message

#### Scenario: Analyze persists clarifications in both artifacts

- **WHEN** the user answers the analyze halt or supplies clarifications after it
- **THEN** the agent updates `analysis.md` **Validated clarifications** (and intent vs implementation when needed)
- **AND** updates affected `specs/**/*.md` files so requirements reflect the clarified intent
- **AND** does not rely on chat-only text as the input for `/qsx:cases`

#### Scenario: Dual analysts when review flag true

- **WHEN** `workflow.multipleSubagents.review` is **true** and the Task tool is available
- **THEN** the agent runs two parallel blind Task subagents with identical analyst briefs before writing user-visible `analysis.md` and delta specs
- **AND** **Synthesis notes** document Agreed / Single-analyst / Contradiction merge

#### Scenario: Orchestrator-only when review flag false

- **WHEN** `workflow.multipleSubagents.review` is **false** or omitted (default)
- **THEN** the orchestrator fetches the change set and writes `analysis.md` and delta specs without invoking Task subagents
- **AND** the workflow does not delegate to a single subagent as a substitute

### Requirement: Cases workflow behavior

The `qaspec-cases` skill and `/qsx:cases` command SHALL produce `testcases.md` with mandatory checkboxes and, for each case, preconditions plus steps with action and expected result built from sources in hand, read the approved change delta specs under `specs/**/*.md` as binding input for the case list, cover every requirement scenario in those specs with at least one case, read `qaspec/references/qase_test_case_rules.md`, read `qaspec/specs/<capability>/spec.md` for capabilities listed in `analysis.md` when present, treat user-validated `analysis.md` and the approved delta specs as the source of truth over PR diff or current implementation when they conflict, honor `workflow.multipleSubagents.cases` from `qaspec/config.yaml` (default **false** when unset), use dual blind analyst Task synthesis for draft lists only when that flag is **true**, otherwise draft cases in the orchestrator without Task subagents, and halt once for human approval of the case list.

#### Scenario: Case list format

- **WHEN** cases output is written
- **THEN** each test case is a single `- [ ]` line with observable title text under a `##` suite heading
- **AND** immediately below that line the case includes **Preconditions** and **Steps** blocks per the schema template

#### Scenario: Cases consume approved delta specs

- **WHEN** the agent runs the cases phase
- **THEN** the agent reads the change `specs/**/*.md` files in full before drafting cases
- **AND** every requirement scenario in those specs maps to at least one test case (self-audit before halt)
- **AND** the agent does not create or update `specs/**/*.md` unless a user clarification during the cases conversation changes agreed behavior

#### Scenario: Single halt for the case list

- **WHEN** the cases phase ends awaiting user approval
- **THEN** the agent asks exactly one question covering approval of the case list
- **AND** the agent does not start publish or Qase MCP in the same message

#### Scenario: analysis.md and specs override diff in cases phase

- **WHEN** the agent runs the cases phase and `analysis.md` or the approved delta specs document expected behavior or a known defect that differs from the PR diff or current code
- **THEN** the agent reads `analysis.md` and the delta specs in full before fetching the change set
- **AND** test cases reflect the agreed requirements, not accidental implementation
- **AND** known defects are tested as corrected behavior, not encoded as accepted SHALL/MUST requirements

#### Scenario: Chat iteration updates affected artifacts

- **WHEN** the user requests case changes after the initial cases draft
- **THEN** the agent updates `testcases.md` in the same conversation without requiring a separate slash command

#### Scenario: Cases iteration updates analysis and specs when behavior agreement changes

- **WHEN** the user clarifies defect vs expected behavior or other agreed facts after the cases draft
- **THEN** the agent updates `analysis.md` (especially **Validated clarifications**) and affected `specs/**/*.md` before updating `testcases.md`

#### Scenario: No invented vague steps

- **WHEN** the agent drafts case steps
- **THEN** each action and expected result uses concrete UI labels, URLs, data, or API behavior found in sources read for this change
- **AND** generic placeholder steps are used only when sources lack actionable detail
- **AND** the agent self-audits before halt that no step is untraceable to a source unless marked as a documented gap

#### Scenario: Dual analysts when cases flag true

- **WHEN** `workflow.multipleSubagents.cases` is **true** and the Task tool is available
- **THEN** the agent runs two parallel blind Task subagents before merging drafts into `testcases.md`

#### Scenario: Orchestrator-only when cases flag false

- **WHEN** `workflow.multipleSubagents.cases` is **false** or omitted (default)
- **THEN** the orchestrator drafts cases without Task subagents
- **AND** the workflow does not delegate to a single subagent as a substitute
