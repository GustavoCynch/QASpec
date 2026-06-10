# config-loading Delta

## ADDED Requirements

### Requirement: Parse tcms target block

The system SHALL parse an optional `tcms` block (`provider`, `project`, `baseUrl` as strings) from project config using resilient field-by-field validation: an invalid field is warned about and omitted, and an invalid or missing block never fails config load.

#### Scenario: Valid tcms block

- **WHEN** config contains `tcms` with `provider: qase`, `project: DEMO`, and `baseUrl: https://app.qase.io`
- **THEN** returned ProjectConfig includes those string values

#### Scenario: Missing tcms block

- **WHEN** config lacks a `tcms` block
- **THEN** config loads successfully
- **AND** ProjectConfig reports no TCMS target (publish performs discovery)

#### Scenario: Invalid tcms field type

- **WHEN** config contains `tcms.project: 123`
- **THEN** a warning is logged
- **AND** that field is omitted from parsed config while valid sibling fields are kept
