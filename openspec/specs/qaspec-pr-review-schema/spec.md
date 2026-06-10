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

### Requirement: Specs artifact co-produced in cases phase

The schema SHALL define artifact `specs` that generates `specs/**/*.md`, requires `analyze`, and uses the same delta format as spec-driven (ADDED, MODIFIED, REMOVED, RENAMED).

#### Scenario: Specs ready after analysis

- **WHEN** `analisis.md` exists for a change using `qaspec-pr-review`
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

### Requirement: Test cases artifact with checkbox template

The schema SHALL define artifact `test-cases` that generates `testcases.md`, requires `analyze`, instructs agents to produce or update change delta specs in the same phase as the case list, SHALL require each test case to include preconditions and numbered steps with action and expected result derived from available sources (not invented), and artifact instructions SHALL defer dual blind Task delegations for draft lists to `workflow.multipleSubagents.cases` in project config (orchestrator-only when false, dual analysts when true).

#### Scenario: Cases depend on analysis

- **WHEN** `analisis.md` exists for the change
- **THEN** `test-cases` becomes ready
- **AND** the template instructs authors to use `- [ ]` checkboxes grouped under `##` suite headings

#### Scenario: Progress parsing

- **WHEN** `openspec status` runs for a change using this schema
- **THEN** checkbox progress in `testcases.md` is reported the same way as `tasks.md` in `spec-driven`
- **AND** only lines matching the checkbox pattern count toward progress (nested case detail does not add extra checkboxes)

#### Scenario: Cases reference main specs

- **WHEN** cases instructions are generated for a change
- **THEN** instructions require reading `openspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md` when those files exist

#### Scenario: Enriched case body under checkbox line

- **WHEN** an agent writes or updates `testcases.md` for a case
- **THEN** the case includes a **Preconditions** block with the standard environment and role prefix plus case-specific preconditions
- **AND** the case includes a **Steps** block where each step has an observable **Action** and **Expected** result (empty expected allowed only for transition steps per Qase rules)
- **AND** step 1 is navigation to the base URL when a URL is known from sources or execution context

#### Scenario: Steps traceable to sources

- **WHEN** cases instructions are loaded for `test-cases`
- **THEN** instructions require building preconditions and steps from `analisis.md`, the change set (PR diff or patch), referenced requirements, `qaspec/specs/<capability>/spec.md`, and observable UI/API detail from read sources
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
- **AND** the dependency shape is `analyze` → (`test-cases` | `specs`) → publish with both cases outputs required for apply
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
