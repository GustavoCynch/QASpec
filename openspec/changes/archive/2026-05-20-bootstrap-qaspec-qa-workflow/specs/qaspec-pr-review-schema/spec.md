# qaspec-pr-review-schema Specification

## Purpose

Define the QASpec QA workflow schema: artifact graph, templates, and publish tracking for PR review cycles.

## ADDED Requirements

### Requirement: Schema identity and validation

The system SHALL ship a schema named `qaspec-pr-review` that validates successfully via `openspec schema validate qaspec-pr-review`.

#### Scenario: Schema validates on install

- **WHEN** a maintainer runs schema validation for `qaspec-pr-review`
- **THEN** validation succeeds with no errors
- **AND** the schema is loadable from the packaged `schemas/qaspec-pr-review/` directory

### Requirement: Analyze artifact

The schema SHALL define artifact `analyze` that generates `analisis.md` with no upstream dependencies.

#### Scenario: First artifact in a new change

- **WHEN** a user creates a change with schema `qaspec-pr-review`
- **THEN** `analyze` is available as the first ready artifact
- **AND** `openspec instructions analyze` resolves output to `analisis.md` under the change directory

### Requirement: Test matrix artifact with checkbox template

The schema SHALL define artifact `test-matrix` that generates `testmatrix.md` and requires `analyze`.

#### Scenario: Matrix depends on analysis

- **WHEN** `analisis.md` exists for the change
- **THEN** `test-matrix` becomes ready
- **AND** the template instructs authors to use `- [ ]` checkboxes grouped under `##` suite headings

#### Scenario: Progress parsing

- **WHEN** `openspec status` runs for a change using this schema
- **THEN** checkbox progress in `testmatrix.md` is reported the same way as `tasks.md` in `spec-driven`

### Requirement: Publish artifact and tracking

The schema SHALL define a publish phase that requires `test-matrix` and tracks `testmatrix.md`.

#### Scenario: Publish readiness

- **WHEN** `testmatrix.md` exists
- **THEN** the publish phase is ready to run
- **AND** `publish.tracks` is set to `testmatrix.md`

#### Scenario: Publish outputs

- **WHEN** publish completes per schema instructions
- **THEN** the change MAY contain `publish-log.md`
- **AND** the change MAY contain `execution-context.md` when Qase prerequisites were collected

### Requirement: No mandatory intake artifact

The schema SHALL NOT require an `intake.md` or separate `tasks.md` for the QA cycle.

#### Scenario: Minimal artifact set

- **WHEN** a user inspects the artifact graph for `qaspec-pr-review`
- **THEN** the required path is `analyze` → `test-matrix` → publish
- **AND** there is no artifact id `intake` in the graph
