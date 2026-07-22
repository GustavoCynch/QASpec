# qas-tcms-target Delta

## MODIFIED Requirements

### Requirement: Per-change TCMS target storage

The change metadata (`.qaspec.yaml`) SHALL support an optional `tcms` block with string fields `provider`, `project`, and `baseUrl`. The CLI SHALL provide `qaspec tcms set --change <name>` with `--provider`, `--project`, and `--base-url` options that upserts provided fields into the block, preserving fields not provided, and SHALL error when no field is provided. `provider` is an open string; no specific TCMS product is privileged.
(Previously: examples used a single vendor-specific string as the sole illustrative provider value.)

#### Scenario: Set persists target in change metadata

- **WHEN** `qaspec tcms set --change pr-415 --provider acme --project PR415` runs
- **THEN** the change's `.qaspec.yaml` contains `tcms` with `provider: acme` and `project: PR415`
- **AND** other metadata (schema, approvals, publishGate) is preserved

#### Scenario: Upsert preserves existing fields

- **GIVEN** a change whose `tcms` block has `provider: acme` and `project: PR415`
- **WHEN** `qaspec tcms set --change pr-415 --base-url https://example.test` runs
- **THEN** the block keeps `provider` and `project` and gains `baseUrl`

### Requirement: Target resolution with config defaults

The system SHALL resolve the effective TCMS target by merging the change-level `tcms` block over the project config `tcms` block field by field, with change-level values winning. A target SHALL be considered usable only when `provider` and `project` are both present after the merge. Absence of `provider` (in both the change and config) is the generic default and SHALL yield a not-usable target, so publish falls through to its existing one-halt-ask target-discovery flow with no resolver special-casing. The CLI SHALL provide `qaspec tcms show --change <name>` (with `--json`) printing the resolved target, the source of each field (`change` or `config`), and usability.
(Previously: the config-defaults example used a vendor-specific provider value and absence was not documented as the generic default.)

#### Scenario: Change-level field overrides config default

- **GIVEN** project config `tcms` with `project: MAIN` and a change `tcms` block with `project: PR415`
- **WHEN** the target is resolved
- **THEN** the effective project is `PR415` sourced from `change`

#### Scenario: Config defaults fill missing fields

- **GIVEN** a change `tcms` block with only `project: PR415` and project config `tcms` with `provider: acme`
- **WHEN** the target is resolved
- **THEN** the target is usable with `provider` sourced from `config`

#### Scenario: Absent provider is the generic default

- **GIVEN** neither the change `tcms` block nor the project config sets a `provider`
- **WHEN** the target is resolved
- **THEN** the resolved target is reported as not usable
- **AND** no explicit `provider: generic` magic string is required to reach this state

#### Scenario: No target anywhere

- **GIVEN** neither the change metadata nor the project config defines `tcms`
- **WHEN** `qaspec tcms show --change <name>` runs
- **THEN** the resolved target is empty and reported as not usable
