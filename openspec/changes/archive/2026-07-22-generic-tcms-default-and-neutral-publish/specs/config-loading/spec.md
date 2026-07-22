# config-loading Delta

## MODIFIED Requirements

### Requirement: Parse tcms defaults block

The system SHALL parse an optional `tcms` block (`provider`, `project`, `baseUrl` as strings) from project config using resilient field-by-field validation: an invalid field is warned about and omitted, and an invalid or missing block never fails config load. The block supplies user-managed defaults only; the per-change target in the change's `.qaspec.yaml` takes precedence. `provider` is an open string with no privileged value; an absent `provider` leaves the target not usable, which is the generic default.
(Previously: the valid-block example used a vendor-specific provider value and base URL.)

#### Scenario: Valid tcms block

- **WHEN** config contains `tcms` with `provider: acme`, `project: DEMO`, and `baseUrl: https://tcms.example.test`
- **THEN** returned ProjectConfig includes those string values

#### Scenario: Missing tcms block

- **WHEN** config lacks a `tcms` block
- **THEN** config loads successfully
- **AND** ProjectConfig reports no TCMS defaults (the target resolves from change metadata or publish discovery)

#### Scenario: Invalid tcms field type

- **WHEN** config contains `tcms.project: 123`
- **THEN** a warning is logged
- **AND** that field is omitted from parsed config while valid sibling fields are kept
