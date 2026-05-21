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

### Requirement: Specs artifact co-produced in matrix phase

The schema SHALL define artifact `specs` that generates `specs/**/*.md`, requires `analyze`, and uses the same delta format as spec-driven (ADDED, MODIFIED, REMOVED, RENAMED).

#### Scenario: Specs ready after analysis

- **WHEN** `analisis.md` exists for a change using `qaspec-pr-review`
- **THEN** artifact `specs` is ready alongside `test-matrix`
- **AND** `openspec instructions specs` resolves output patterns under `specs/<capability>/spec.md` in the change directory

#### Scenario: Specs template and main-spec baseline

- **WHEN** an agent creates delta specs for this change
- **THEN** instructions require reading existing `openspec/specs/<capability>/spec.md` for each affected capability before MODIFIED blocks
- **AND** the packaged template `schemas/qaspec-pr-review/templates/spec.md` follows spec-driven delta structure

#### Scenario: Matrix phase instruction coupling

- **WHEN** schema instructions for `test-matrix` and `specs` are loaded
- **THEN** `test-matrix` instructs co-creation or update of `specs/**/*.md` in the same phase as `testmatrix.md`
- **AND** `specs` instructs alignment with the case list in `testmatrix.md` (no orphan requirements)

### Requirement: Analyze artifact

The schema SHALL define artifact `analyze` that generates `analisis.md` with no upstream dependencies.

#### Scenario: First artifact in a new change

- **WHEN** a user creates a change with schema `qaspec-pr-review`
- **THEN** `analyze` is available as the first ready artifact
- **AND** `openspec instructions analyze` resolves output to `analisis.md` under the change directory

#### Scenario: Affected capabilities seed specs

- **WHEN** `analisis.md` is created
- **THEN** the artifact includes an **Affected capabilities** section with kebab-case capability names
- **AND** instructions state that delta specs are not written in the analyze step

### Requirement: Test matrix artifact with checkbox template

The schema SHALL define artifact `test-matrix` that generates `testmatrix.md`, requires `analyze`, instructs agents to produce or update change delta specs in the same phase as the matrix, and SHALL require each test case to include preconditions and numbered steps with action and expected result derived from available sources (not invented).

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
- **THEN** the case includes a **Preconditions** block with the standard environment and role prefix plus case-specific preconditions
- **AND** the case includes a **Steps** block where each step has an observable **Action** and **Expected** result (empty expected allowed only for transition steps per Qase rules)
- **AND** step 1 is navigation to the base URL when a URL is known from sources or execution context

#### Scenario: Steps traceable to sources

- **WHEN** matrix instructions are loaded for `test-matrix`
- **THEN** instructions require building preconditions and steps from `analisis.md`, the change set (PR diff or patch), referenced requirements, `qaspec/specs/<capability>/spec.md`, and observable UI/API detail from read sources
- **AND** instructions forbid vague invented flows (e.g. generic "use any available flow") unless sources lack actionable detail
- **AND** when a generic step is used due to missing detail, instructions require documenting the gap (e.g. HTML comment `<!-- gap: ... -->` or equivalent self-audit before halt)

#### Scenario: Template demonstrates enriched format

- **WHEN** a maintainer opens `schemas/qaspec-pr-review/templates/testmatrix.md`
- **THEN** the template shows at least one full example case with **Preconditions** and **Steps** under a checkbox line
- **AND** the example aligns with `qaspec/references/qase_test_case_rules.md` narrative rules

### Requirement: Publish artifact and tracking

The schema SHALL define a publish phase that requires both `test-matrix` and `specs`, tracks `testmatrix.md`, and SHALL instruct publish to use preconditions and steps recorded under each approved case in `testmatrix.md` when preparing Qase payloads.

#### Scenario: Publish readiness

- **WHEN** `testmatrix.md` exists and at least one file exists under `specs/` for the change
- **THEN** the publish phase is ready to run
- **AND** `publish.tracks` is set to `testmatrix.md`

#### Scenario: Publish outputs

- **WHEN** publish completes per schema instructions
- **THEN** the change MAY contain `publish-log.md`
- **AND** the change MAY contain `execution-context.md` when Qase prerequisites were collected
- **AND** the change SHALL contain `publish-plan.md` after the prepare step and before MCP upload

#### Scenario: Prepare step before MCP

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require writing `execution-context.md` and `publish-plan.md` before any Qase MCP call
- **AND** instructions require exactly one user confirmation halt after those files exist
- **AND** instructions forbid MCP upload in the same message as initial creation of those files

#### Scenario: Publish reads case blocks from matrix

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require reading **Preconditions** and **Steps** under each unchecked case in `testmatrix.md` when building `publish-plan.md` and Qase `create_case` payloads
- **AND** instructions forbid deriving steps solely from the case title when a **Steps** block exists for that case

### Requirement: Publish-side artifact templates

The schema package SHALL include optional templates `publish-log.md`, `execution-context.md`, and `publish-plan.md` under `schemas/qaspec-pr-review/templates/` for agents to use when the publish (`apply`) phase creates tracking files.

#### Scenario: Publish log template exists

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/publish-log.md` exists with section placeholders for suite/case trace
- **AND** `apply.instruction` in `schema.yaml` remains consistent with those file names

#### Scenario: Execution context template exists

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/execution-context.md` exists with placeholders for Qase project code, role, and base URL
- **AND** instructions state the file is created or updated during publish prepare, before user confirmation

#### Scenario: Publish plan template exists

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/publish-plan.md` exists with placeholders for suites and cases to upload
- **AND** `apply.instruction` references `publish-plan.md` as the pre-upload review artifact

### Requirement: No mandatory intake artifact

The schema SHALL NOT require an `intake.md` or separate `tasks.md` for the QA cycle.

#### Scenario: QA artifact graph

- **WHEN** a user inspects the artifact graph for `qaspec-pr-review`
- **THEN** artifacts `analyze`, `test-matrix`, and `specs` are required before publish
- **AND** the dependency shape is `analyze` → (`test-matrix` | `specs`) → publish with both matrix outputs required for apply
- **AND** there is no artifact id `intake` in the graph
