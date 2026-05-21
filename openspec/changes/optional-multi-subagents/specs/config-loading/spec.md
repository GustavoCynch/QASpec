## ADDED Requirements

### Requirement: Parse workflow multipleSubagents flags

The system SHALL parse optional `workflow.multipleSubagents.review` and `workflow.multipleSubagents.matrix` as booleans from project config using resilient field-by-field validation.

#### Scenario: Valid workflow flags

- **WHEN** config contains `workflow.multipleSubagents.review: false` and `matrix: true`
- **THEN** returned ProjectConfig includes those boolean values for instruction loading

#### Scenario: Omitted workflow block

- **WHEN** config lacks `workflow.multipleSubagents`
- **THEN** instruction loading treats both review and matrix as **false** for subagent mode injection

#### Scenario: Invalid workflow flag type

- **WHEN** config contains `workflow.multipleSubagents.review: "yes"`
- **THEN** a warning is logged
- **AND** that field is omitted from parsed config (phase falls back to default false)
