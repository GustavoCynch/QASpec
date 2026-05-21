## MODIFIED Requirements

### Requirement: Publish artifact and tracking

The schema SHALL define a publish phase that requires both `test-matrix` and `specs`, and tracks `testmatrix.md`.

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
