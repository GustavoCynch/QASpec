## ADDED Requirements

### Requirement: Seed documents multipleSubagents defaults

When init creates a new project config with schema `qaspec-pr-review`, the seed SHALL include `workflow.multipleSubagents` with `review: false` and `matrix: false` unless the user already supplied values.

#### Scenario: Fresh init includes workflow block

- **WHEN** init creates `qaspec/config.yaml` with `schema: qaspec-pr-review` and no prior config existed
- **THEN** the file contains `workflow.multipleSubagents.review: false`
- **AND** the file contains `workflow.multipleSubagents.matrix: false`
- **AND** a short comment or context line explains that `true` enables dual blind Task analysts for that phase

#### Scenario: Existing config is not overwritten

- **WHEN** init runs in extend mode and config already exists
- **THEN** the CLI does not replace existing `workflow` settings
