## ADDED Requirements

### Requirement: Publish-side artifact templates

The schema package SHALL include optional templates `publish-log.md` and `execution-context.md` under `schemas/qaspec-pr-review/templates/` for agents to use when the publish (`apply`) phase creates tracking files.

#### Scenario: Publish log template exists

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/publish-log.md` exists with section placeholders for suite/case trace
- **AND** `apply.instruction` in `schema.yaml` remains consistent with those file names

#### Scenario: Execution context template exists

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/execution-context.md` exists with placeholders for Qase project code, role, and base URL
- **AND** instructions state the file is optional and create-if-missing during publish
