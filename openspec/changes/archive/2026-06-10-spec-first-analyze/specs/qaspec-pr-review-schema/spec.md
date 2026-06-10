## RENAMED Requirements

- FROM: `### Requirement: Specs artifact co-produced in cases phase`
- TO: `### Requirement: Specs artifact co-produced in analyze phase`

## MODIFIED Requirements

### Requirement: Specs artifact co-produced in analyze phase

The schema SHALL define artifact `specs` that generates `specs/**/*.md`, requires `analyze`, is co-produced in the analyze phase alongside `analysis.md`, and uses the same delta format as spec-driven (ADDED, MODIFIED, REMOVED, RENAMED).

#### Scenario: Specs ready after analysis

- **WHEN** `analysis.md` exists for a change using `qaspec-pr-review`
- **THEN** artifact `specs` is ready
- **AND** `openspec instructions specs` resolves output patterns under `specs/<capability>/spec.md` in the change directory

#### Scenario: Specs template and main-spec baseline

- **WHEN** an agent creates delta specs for this change
- **THEN** instructions require reading existing `openspec/specs/<capability>/spec.md` for each affected capability before MODIFIED blocks
- **AND** the packaged template `schemas/qaspec-pr-review/templates/spec.md` follows spec-driven delta structure

#### Scenario: Analyze phase instruction coupling

- **WHEN** schema instructions for `analyze` and `specs` are loaded
- **THEN** `analyze` instructs co-creation or update of `specs/**/*.md` in the same phase as `analysis.md`
- **AND** `specs` instructs alignment with agreed behavior in `analysis.md` (especially **Validated clarifications** and **Functional intent vs implementation**)

### Requirement: Analyze artifact

The schema SHALL define artifact `analyze` that generates `analysis.md` with no upstream dependencies, SHALL instruct agents to co-produce change delta specs under `specs/**/*.md` in the same phase after reading existing `qaspec/specs/<capability>/spec.md` for each affected capability, SHALL end the phase with exactly one halt covering approval of both `analysis.md` and the delta specs, and artifact instructions SHALL defer dual blind Task delegations to `workflow.multipleSubagents.review` in project config (orchestrator-only when false, dual analysts when true).

#### Scenario: First artifact in a new change

- **WHEN** a user creates a change with schema `qaspec-pr-review`
- **THEN** `analyze` is available as the first ready artifact
- **AND** `openspec instructions analyze` resolves output to `analysis.md` under the change directory

#### Scenario: Affected capabilities seed specs in the same phase

- **WHEN** `analysis.md` is created
- **THEN** the artifact includes an **Affected capabilities** section with kebab-case capability names
- **AND** instructions require creating or updating `specs/<capability>/spec.md` deltas for testable behavior in the same phase, before the halt

#### Scenario: Analyze reads existing capability specs

- **WHEN** analyze instructions are generated for a change whose affected capabilities have existing `qaspec/specs/<capability>/spec.md` files
- **THEN** instructions require reading each existing capability spec before writing the analysis and delta specs
- **AND** MODIFIED delta blocks copy the full requirement from the existing spec before editing

#### Scenario: Single halt covers analysis and specs

- **WHEN** the analyze phase ends awaiting user input
- **THEN** the agent asks exactly one question covering both `analysis.md` and the drafted delta specs
- **AND** user clarifications after the halt update both `analysis.md` (**Validated clarifications**) and affected `specs/**/*.md` files

#### Scenario: Analyze instructions respect subagent flag

- **WHEN** `qaspec instructions analyze --json` is run for a project with `workflow.multipleSubagents.review: false`
- **THEN** enriched instructions tell the agent not to use Task subagents for analyze
- **WHEN** the same command runs with `review: true`
- **THEN** enriched instructions require dual blind parallel Task delegations and synthesis notes

### Requirement: Test cases artifact with checkbox template

The schema SHALL define artifact `test-cases` that generates `testcases.md`, requires `analyze` and `specs`, instructs agents to read the change delta specs as binding input for the case list and cover every requirement scenario with at least one case, SHALL require each test case to include preconditions and numbered steps with action and expected result derived from available sources (not invented), and artifact instructions SHALL defer dual blind Task delegations for draft lists to `workflow.multipleSubagents.cases` in project config (orchestrator-only when false, dual analysts when true).

#### Scenario: Cases depend on analysis and specs

- **WHEN** `analysis.md` exists and at least one file exists under `specs/` for the change
- **THEN** `test-cases` becomes ready
- **AND** the template instructs authors to use `- [ ]` checkboxes grouped under `##` suite headings

#### Scenario: Progress parsing

- **WHEN** `openspec status` runs for a change using this schema
- **THEN** checkbox progress in `testcases.md` is reported the same way as `tasks.md` in `spec-driven`
- **AND** only lines matching the checkbox pattern count toward progress (nested case detail does not add extra checkboxes)

#### Scenario: Cases consume approved delta specs

- **WHEN** cases instructions are generated for a change
- **THEN** instructions require reading the change `specs/**/*.md` files and `qaspec/specs/<capability>/spec.md` for capabilities listed in `analysis.md` when those files exist
- **AND** instructions require that every requirement scenario in the change delta specs maps to at least one test case (self-audit before halt)
- **AND** instructions do not direct the agent to create or update `specs/**/*.md` in this phase

#### Scenario: Enriched case body under checkbox line

- **WHEN** an agent writes or updates `testcases.md` for a case
- **THEN** the case includes a **Preconditions** block with the standard environment and role prefix plus case-specific preconditions
- **AND** the case includes a **Steps** block where each step has an observable **Action** and **Expected** result (empty expected allowed only for transition steps per Qase rules)
- **AND** step 1 is navigation to the base URL when a URL is known from sources or execution context

#### Scenario: Steps traceable to sources

- **WHEN** cases instructions are loaded for `test-cases`
- **THEN** instructions require building preconditions and steps from `analysis.md`, the change delta specs, the change set (PR diff or patch), referenced requirements, `qaspec/specs/<capability>/spec.md`, and observable UI/API detail from read sources
- **AND** instructions forbid vague invented flows (e.g. generic "use any available flow") unless sources lack actionable detail
- **AND** when a generic step is used due to missing detail, instructions require documenting the gap (e.g. HTML comment `<!-- gap: ... -->` or equivalent self-audit before halt)

#### Scenario: Template demonstrates enriched format

- **WHEN** a maintainer opens `schemas/qaspec-pr-review/templates/testcases.md`
- **THEN** the template shows at least one full example case with **Preconditions** and **Steps** under a checkbox line
- **AND** the example aligns with `qaspec/references/qase_test_case_rules.md` narrative rules

#### Scenario: Cases instructions respect subagent flag

- **WHEN** `qaspec instructions test-cases --json` runs for a project with `workflow.multipleSubagents.cases: false`
- **THEN** enriched instructions tell the agent not to use Task subagents for case drafting
- **WHEN** the same command runs with `cases: true`
- **THEN** enriched instructions require dual blind parallel Task delegations for draft lists before merge

### Requirement: No mandatory intake artifact

The schema SHALL NOT require an `intake.md` or separate `tasks.md` for the QA cycle.

#### Scenario: QA artifact graph

- **WHEN** a user inspects the artifact graph for `qaspec-pr-review`
- **THEN** artifacts `analyze`, `test-cases`, and `specs` are required before publish
- **AND** the dependency shape is `analyze` → `specs` → `test-cases` → publish with both cases-side outputs required for apply
- **AND** there is no artifact id `intake` in the graph
