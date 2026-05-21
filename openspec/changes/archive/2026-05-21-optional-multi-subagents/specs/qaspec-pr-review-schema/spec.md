## MODIFIED Requirements

### Requirement: Analyze artifact

The schema SHALL define artifact `analyze` that generates `analisis.md` with no upstream dependencies, and artifact instructions SHALL defer dual blind Task delegations to `workflow.multipleSubagents.review` in project config (orchestrator-only when false, dual analysts when true).

#### Scenario: First artifact in a new change

- **WHEN** a user creates a change with schema `qaspec-pr-review`
- **THEN** `analyze` is available as the first ready artifact
- **AND** `openspec instructions analyze` resolves output to `analisis.md` under the change directory

#### Scenario: Affected capabilities seed specs

- **WHEN** `analisis.md` is created
- **THEN** the artifact includes an **Affected capabilities** section with kebab-case capability names
- **AND** instructions state that delta specs are not written in the analyze step

#### Scenario: Analyze instructions respect subagent flag

- **WHEN** `qaspec instructions analyze --json` is run for a project with `workflow.multipleSubagents.review: false`
- **THEN** enriched instructions tell the agent not to use Task subagents for analyze
- **WHEN** the same command runs with `review: true`
- **THEN** enriched instructions require dual blind parallel Task delegations and synthesis notes

### Requirement: Test matrix artifact with checkbox template

The schema SHALL define artifact `test-matrix` that generates `testmatrix.md`, requires `analyze`, instructs agents to produce or update change delta specs in the same phase as the matrix, SHALL require each test case to include preconditions and numbered steps with action and expected result derived from available sources (not invented), and artifact instructions SHALL defer dual blind Task delegations for draft lists to `workflow.multipleSubagents.matrix` in project config (orchestrator-only when false, dual analysts when true).

#### Scenario: Matrix depends on analysis

- **WHEN** `analisis.md` exists for the change
- **THEN** `test-matrix` becomes ready
- **AND** the template instructs authors to use `- [ ]` checkboxes grouped under `##` suite headings

#### Scenario: Progress parsing

- **WHEN** `openspec status` runs for a change using this schema
- **THEN** checkbox progress in `testmatrix.md` is reported the same way as `tasks.md` in `spec-driven`
- **AND** only lines matching the checkbox pattern count toward progress (nested case detail does not add extra checkboxes)

#### Scenario: Matrix references main specs

- **WHEN** matrix instructions are generated for a change
- **THEN** instructions require reading `openspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md` when those files exist

#### Scenario: Enriched case body under checkbox line

- **WHEN** an agent writes or updates `testmatrix.md` for a case
- **THEN** the case includes **Preconditions** and **Steps** with action and expected result under the checkbox line per template
- **AND** instructions require building steps from sources in hand

#### Scenario: Matrix instructions respect subagent flag

- **WHEN** `qaspec instructions test-matrix --json` runs for a project with `workflow.multipleSubagents.matrix: false`
- **THEN** enriched instructions tell the agent not to use Task subagents for matrix drafting
- **WHEN** the same command runs with `matrix: true`
- **THEN** enriched instructions require dual blind parallel Task delegations for draft lists before merge
