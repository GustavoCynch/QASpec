# qaspec-pr-review-schema Specification

## Purpose

Define the QASpec QA workflow schema: artifact graph, templates, and publish tracking for PR review cycles.

## Requirements

### Requirement: Schema identity and validation

The system SHALL ship a schema named `qaspec-pr-review` that validates successfully via `openspec schema validate qaspec-pr-review`.

#### Scenario: Schema validates on install

- **WHEN** a maintainer runs schema validation for `qaspec-pr-review`
- **THEN** validation succeeds with no errors
- **AND** the schema is loadable from the packaged `schemas/qaspec-pr-review/` directory

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

### Requirement: Publish artifact and tracking

The schema SHALL define a publish phase that requires both `test-cases` and `specs`, tracks `testcases.md`, and SHALL instruct publish to resolve the TCMS target from the `tcms` block in project config, present an in-chat summary of unchecked cases before one confirmation halt, and use preconditions and steps recorded under each approved case in `testcases.md` when preparing Qase payloads. The instruction SHALL NOT direct agents to write `publish-plan.md` or `execution-context.md`.

#### Scenario: Publish readiness

- **WHEN** `testcases.md` exists and at least one file exists under `specs/` for the change
- **THEN** the publish phase is ready to run
- **AND** `publish.tracks` is set to `testcases.md`

#### Scenario: Publish outputs

- **WHEN** publish completes per schema instructions
- **THEN** the change contains `publish-log.md` with the suite/case trace
- **AND** the instructions do not require any other publish-side file in the change directory

#### Scenario: Summary and confirm before MCP

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require an in-chat summary (target, suites, unchecked-case counts, warnings) derived from `testcases.md`
- **AND** instructions require exactly one user confirmation halt after the summary
- **AND** instructions forbid MCP upload in the same message as TCMS target selection or persistence

#### Scenario: Publish reads case blocks from the case list

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require reading **Preconditions** and **Steps** under each unchecked case in `testcases.md` when building Qase `create_case` payloads
- **AND** instructions forbid deriving steps solely from the case title when a **Steps** block exists for that case

### Requirement: Publish-side artifact templates

The schema package SHALL include the template `publish-log.md` under `schemas/qaspec-pr-review/templates/` for agents to use when the publish (`apply`) phase records upload results. The package SHALL NOT include `execution-context.md` or `publish-plan.md` templates.

#### Scenario: Publish log template exists

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/publish-log.md` exists with section placeholders for suite/case trace
- **AND** `apply.instruction` in `schema.yaml` remains consistent with that file name

#### Scenario: Prepare-file templates removed

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/execution-context.md` and `templates/publish-plan.md` do not exist
- **AND** `apply.instruction` does not reference them

### Requirement: No mandatory intake artifact

The schema SHALL NOT require an `intake.md` or separate `tasks.md` for the QA cycle.

#### Scenario: QA artifact graph

- **WHEN** a user inspects the artifact graph for `qaspec-pr-review`
- **THEN** artifacts `analyze`, `test-cases`, and `specs` are required before publish
- **AND** the dependency shape is `analyze` → `specs` → `test-cases` → publish with both cases-side outputs required for apply
- **AND** there is no artifact id `intake` in the graph

### Requirement: Legacy testmatrix tracking fallback

For changes created before the rename, progress tracking and publish SHALL fall back to `testmatrix.md` when `testcases.md` does not exist in the change directory, emitting a one-line notice that suggests renaming the file. New writes SHALL always target `testcases.md`.

#### Scenario: Status on a legacy in-flight change

- **GIVEN** a change directory contains `testmatrix.md` and no `testcases.md`
- **WHEN** `openspec status` runs for that change
- **THEN** checkbox progress is reported from `testmatrix.md`
- **AND** a notice suggests `git mv testmatrix.md testcases.md`

#### Scenario: New change uses the new file only

- **WHEN** a change is created after the rename and the cases phase runs
- **THEN** the artifact is written to `testcases.md`
- **AND** no `testmatrix.md` is created

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
