# qaspec-pr-review-schema Delta

## MODIFIED Requirements

### Requirement: Analyze artifact

The schema SHALL define artifact `analyze` that generates `analysis.md` with no upstream dependencies, and artifact instructions SHALL defer dual blind Task delegations to `workflow.multipleSubagents.review` in project config (orchestrator-only when false, dual analysts when true).

#### Scenario: First artifact in a new change

- **WHEN** a user creates a change with schema `qaspec-pr-review`
- **THEN** `analyze` is available as the first ready artifact
- **AND** `openspec instructions analyze` resolves output to `analysis.md` under the change directory

#### Scenario: Affected capabilities seed specs

- **WHEN** `analysis.md` is created
- **THEN** the artifact includes an **Affected capabilities** section with kebab-case capability names
- **AND** instructions state that delta specs are not written in the analyze step

#### Scenario: Analyze instructions respect subagent flag

- **WHEN** `qaspec instructions analyze --json` is run for a project with `workflow.multipleSubagents.review: false`
- **THEN** enriched instructions tell the agent not to use Task subagents for analyze
- **WHEN** the same command runs with `review: true`
- **THEN** enriched instructions require dual blind parallel Task delegations and synthesis notes

### Requirement: Specs artifact co-produced in cases phase

The schema SHALL define artifact `specs` that generates `specs/**/*.md`, requires `analyze`, and uses the same delta format as spec-driven (ADDED, MODIFIED, REMOVED, RENAMED).

#### Scenario: Specs ready after analysis

- **WHEN** `analysis.md` exists for a change using `qaspec-pr-review`
- **THEN** artifact `specs` is ready alongside `test-cases`
- **AND** `openspec instructions specs` resolves output patterns under `specs/<capability>/spec.md` in the change directory

#### Scenario: Specs template and main-spec baseline

- **WHEN** an agent creates delta specs for this change
- **THEN** instructions require reading existing `openspec/specs/<capability>/spec.md` for each affected capability before MODIFIED blocks
- **AND** the packaged template `schemas/qaspec-pr-review/templates/spec.md` follows spec-driven delta structure

#### Scenario: Cases phase instruction coupling

- **WHEN** schema instructions for `test-cases` and `specs` are loaded
- **THEN** `test-cases` instructs co-creation or update of `specs/**/*.md` in the same phase as `testcases.md`
- **AND** `specs` instructs alignment with the case list in `testcases.md` (no orphan requirements)

### Requirement: Test cases artifact with checkbox template

The schema SHALL define artifact `test-cases` that generates `testcases.md`, requires `analyze`, instructs agents to produce or update change delta specs in the same phase as the case list, SHALL require each test case to include preconditions and numbered steps with action and expected result derived from available sources (not invented), and artifact instructions SHALL defer dual blind Task delegations for draft lists to `workflow.multipleSubagents.cases` in project config (orchestrator-only when false, dual analysts when true).

#### Scenario: Cases depend on analysis

- **WHEN** `analysis.md` exists for the change
- **THEN** `test-cases` becomes ready
- **AND** the template instructs authors to use `- [ ]` checkboxes grouped under `##` suite headings

#### Scenario: Progress parsing

- **WHEN** `openspec status` runs for a change using this schema
- **THEN** checkbox progress in `testcases.md` is reported the same way as `tasks.md` in `spec-driven`
- **AND** only lines matching the checkbox pattern count toward progress (nested case detail does not add extra checkboxes)

#### Scenario: Cases reference main specs

- **WHEN** cases instructions are generated for a change
- **THEN** instructions require reading `openspec/specs/<capability>/spec.md` for capabilities listed in `analysis.md` when those files exist

#### Scenario: Enriched case body under checkbox line

- **WHEN** an agent writes or updates `testcases.md` for a case
- **THEN** the case includes a **Preconditions** block with the standard environment and role prefix plus case-specific preconditions
- **AND** the case includes a **Steps** block where each step has an observable **Action** and **Expected** result (empty expected allowed only for transition steps per Qase rules)
- **AND** step 1 is navigation to the base URL when a URL is known from sources or execution context

#### Scenario: Steps traceable to sources

- **WHEN** cases instructions are loaded for `test-cases`
- **THEN** instructions require building preconditions and steps from `analysis.md`, the change set (PR diff or patch), referenced requirements, `qaspec/specs/<capability>/spec.md`, and observable UI/API detail from read sources
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

## ADDED Requirements

### Requirement: Legacy analisis filename fallback

For changes created before the rename, dependency resolution and instruction loading SHALL fall back to `analisis.md` when `analysis.md` does not exist in the change directory, emitting a one-line notice that suggests renaming the file. New writes SHALL always target `analysis.md`, and when both files exist the new name wins.

#### Scenario: Cases phase on a legacy change

- **GIVEN** a change directory contains `analisis.md` and no `analysis.md`
- **WHEN** instructions for `test-cases` or `specs` are loaded
- **THEN** the analyze dependency is considered satisfied and the legacy file is the read source
- **AND** a notice suggests `git mv analisis.md analysis.md`

#### Scenario: New change uses the new file only

- **WHEN** a change is created after the rename and the analyze phase runs
- **THEN** the artifact is written to `analysis.md`
- **AND** no `analisis.md` is created
