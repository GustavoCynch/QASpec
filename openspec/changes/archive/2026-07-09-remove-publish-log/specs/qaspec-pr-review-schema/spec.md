# qaspec-pr-review-schema — delta for remove-publish-log

## MODIFIED Requirements

### Requirement: Publish artifact and tracking

The schema SHALL define a publish phase that requires both `test-cases` and `specs`, tracks `testcases.md`, and SHALL instruct publish to resolve the TCMS target per change via `qaspec tcms show` (change `.openspec.yaml` `tcms` block merged over project-config defaults) — defaulting to proposing a new TCMS project in one halt when no usable target exists, persisting the user's choice via `qaspec tcms set` and never writing the `tcms` block in `qaspec/config.yaml` — run `qaspec publish-gate` before the summary, present an in-chat summary of unchecked cases plus the full Qase payload of one representative case before one confirmation halt, and use preconditions and steps recorded under each approved case in `testcases.md` when preparing Qase payloads. Upload SHALL proceed only with the user's confirmation and the current gate token. Checkbox marks in `testcases.md` SHALL be the only local publish tracking: after each successful upload the agent marks that case `- [x]`. On any re-run the agent SHALL reconcile unchecked cases against existing Qase cases by title before creating and SHALL never blind-create. Qase fields not present in the project's field mapping SHALL be omitted or sent with the documented default, never inferred. The instruction SHALL NOT direct agents to write `publish-log.md`, `publish-plan.md`, or `execution-context.md`.

#### Scenario: Publish readiness

- **WHEN** `testcases.md` exists and at least one file exists under `specs/` for the change
- **THEN** the publish phase is ready to run
- **AND** `publish.tracks` is set to `testcases.md`

#### Scenario: Gate precedes the summary

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require running `qaspec publish-gate --change <name>` before presenting the publish summary
- **AND** instructions forbid Qase MCP upload without citing the current gate token alongside the user's confirmation

#### Scenario: Summary and confirm before MCP

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require an in-chat summary (target, suites, unchecked-case counts, warnings) derived from `testcases.md`
- **AND** the summary includes the full payload of one representative case (fields as they will be sent)
- **AND** instructions require exactly one user confirmation halt after the summary
- **AND** instructions forbid MCP upload in the same message as TCMS target selection or persistence

#### Scenario: Checkbox marked after each upload

- **WHEN** the user confirms publish and a case is created in Qase via MCP
- **THEN** the agent marks that case `- [x]` in `testcases.md` immediately after the successful create call
- **AND** no `publish-log.md` or other per-case trace file is written

#### Scenario: Re-run reconciles instead of duplicating

- **GIVEN** a previous publish attempt left unchecked cases in `testcases.md`
- **WHEN** publish runs again and the user confirms
- **THEN** the agent checks each unchecked case against existing Qase cases by title before creating
- **AND** cases already present in Qase are marked `- [x]` without a duplicate create call

#### Scenario: Publish reads case blocks from the case list

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require reading **Preconditions** and **Steps** under each unchecked case in `testcases.md` when building Qase `create_case` payloads
- **AND** instructions forbid deriving steps solely from the case title when a **Steps** block exists for that case

#### Scenario: Unmapped fields are never inferred

- **WHEN** the agent builds a Qase payload and a field has no entry in the project's field mapping reference
- **THEN** the field is omitted or sent with the documented default
- **AND** severity, priority, and type values are never invented by the agent

### Requirement: Publish-side artifact templates

The schema package SHALL NOT include publish-side trace or prepare templates: `publish-log.md`, `execution-context.md`, and `publish-plan.md` MUST NOT exist under `schemas/qaspec-pr-review/templates/`, and `apply.instruction` in `schema.yaml` MUST NOT reference them.

#### Scenario: Publish trace and prepare templates removed

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/publish-log.md`, `templates/execution-context.md`, and `templates/publish-plan.md` do not exist
- **AND** `apply.instruction` does not reference any of them
