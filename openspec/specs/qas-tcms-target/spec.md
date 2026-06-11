# qas-tcms-target Specification

## Purpose

Store and resolve the TCMS publish target per change, so project codes and base URLs that vary per PR or tenant never leak into project-wide config.

## Requirements

### Requirement: Per-change TCMS target storage

The change metadata (`.qaspec.yaml`) SHALL support an optional `tcms` block with string fields `provider`, `project`, and `baseUrl`. The CLI SHALL provide `qaspec tcms set --change <name>` with `--provider`, `--project`, and `--base-url` options that upserts provided fields into the block, preserving fields not provided, and SHALL error when no field is provided.

#### Scenario: Set persists target in change metadata

- **WHEN** `qaspec tcms set --change pr-415 --provider qase --project PR415` runs
- **THEN** the change's `.qaspec.yaml` contains `tcms` with `provider: qase` and `project: PR415`
- **AND** other metadata (schema, approvals, publishGate) is preserved

#### Scenario: Upsert preserves existing fields

- **GIVEN** a change whose `tcms` block has `provider: qase` and `project: PR415`
- **WHEN** `qaspec tcms set --change pr-415 --base-url https://example.test` runs
- **THEN** the block keeps `provider` and `project` and gains `baseUrl`

### Requirement: Target resolution with config defaults

The system SHALL resolve the effective TCMS target by merging the change-level `tcms` block over the project config `tcms` block field by field, with change-level values winning. A target SHALL be considered usable only when `provider` and `project` are both present after the merge. The CLI SHALL provide `qaspec tcms show --change <name>` (with `--json`) printing the resolved target, the source of each field (`change` or `config`), and usability.

#### Scenario: Change-level field overrides config default

- **GIVEN** project config `tcms` with `project: MAIN` and a change `tcms` block with `project: PR415`
- **WHEN** the target is resolved
- **THEN** the effective project is `PR415` sourced from `change`

#### Scenario: Config defaults fill missing fields

- **GIVEN** a change `tcms` block with only `project: PR415` and project config `tcms` with `provider: qase`
- **WHEN** the target is resolved
- **THEN** the target is usable with `provider` sourced from `config`

#### Scenario: No target anywhere

- **GIVEN** neither the change metadata nor the project config defines `tcms`
- **WHEN** `qaspec tcms show --change <name>` runs
- **THEN** the resolved target is empty and reported as not usable

### Requirement: Publish flows never write project-config TCMS

Publish workflow instructions and the `qaspec tcms` command SHALL only persist targets to the change's `.qaspec.yaml`. The project config `tcms` block SHALL be treated as user-managed defaults that no workflow or CLI command writes.

#### Scenario: Target persistence is change-scoped

- **WHEN** a publish flow persists a chosen TCMS target
- **THEN** it runs `qaspec tcms set --change <name> ...`
- **AND** `qaspec/config.yaml` is not modified
