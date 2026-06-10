# config-loading Delta

## MODIFIED Requirements

### Requirement: Parse workflow multipleSubagents flags

The system SHALL parse optional `workflow.multipleSubagents.review` and `workflow.multipleSubagents.cases` as booleans from project config using resilient field-by-field validation, and SHALL accept the legacy key `workflow.multipleSubagents.matrix` as an alias for `cases` (canonical key wins when both are present) with a one-line rename notice.

#### Scenario: Valid workflow flags

- **WHEN** config contains `workflow.multipleSubagents.review: false` and `cases: true`
- **THEN** returned ProjectConfig includes those boolean values for instruction loading

#### Scenario: Legacy matrix key still honored

- **WHEN** config contains `workflow.multipleSubagents.matrix: true` and no `cases` key
- **THEN** the parsed config treats `cases` as **true**
- **AND** a notice mentions the key was renamed to `cases`

#### Scenario: Canonical key wins over legacy key

- **WHEN** config contains both `workflow.multipleSubagents.cases: false` and `matrix: true`
- **THEN** the parsed config treats `cases` as **false**

#### Scenario: Omitted workflow block

- **WHEN** config lacks `workflow.multipleSubagents`
- **THEN** instruction loading treats both review and cases as **false** for subagent mode injection

#### Scenario: Invalid workflow flag type

- **WHEN** config contains `workflow.multipleSubagents.review: "yes"`
- **THEN** a warning is logged
- **AND** that field is omitted from parsed config (phase falls back to default false)
