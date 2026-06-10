# qaspec-pr-review-schema Delta

## MODIFIED Requirements

### Requirement: Publish artifact and tracking

The schema SHALL define a publish phase that requires both `test-cases` and `specs`, tracks `testcases.md`, and SHALL instruct publish to resolve the TCMS target from the `tcms` block in project config, present an in-chat summary of unchecked cases before one confirmation halt, and use preconditions and steps recorded under each approved case in `testcases.md` when preparing Qase payloads. The instruction SHALL NOT direct agents to write `publish-plan.md` or `execution-context.md`.

#### Scenario: Publish readiness

- **WHEN** `testcases.md` exists and at least one file exists under `specs/` for the change
- **THEN** the publish phase is ready to run
- **AND** `publish.tracks` is set to `testcases.md`

#### Scenario: Publish outputs

- **WHEN** publish completes per schema instructions
- **THEN** the change contains `publish-log.md` with the suite/case trace
- **AND** the instructions do not require any other publish-side file in the change directory

#### Scenario: Summary and confirm before MCP

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require an in-chat summary (target, suites, unchecked-case counts, warnings) derived from `testcases.md`
- **AND** instructions require exactly one user confirmation halt after the summary
- **AND** instructions forbid MCP upload in the same message as TCMS target selection or persistence

#### Scenario: Publish reads case blocks from the case list

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require reading **Preconditions** and **Steps** under each unchecked case in `testcases.md` when building Qase `create_case` payloads
- **AND** instructions forbid deriving steps solely from the case title when a **Steps** block exists for that case

### Requirement: Publish-side artifact templates

The schema package SHALL include the template `publish-log.md` under `schemas/qaspec-pr-review/templates/` for agents to use when the publish (`apply`) phase records upload results. The package SHALL NOT include `execution-context.md` or `publish-plan.md` templates.

#### Scenario: Publish log template exists

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/publish-log.md` exists with section placeholders for suite/case trace
- **AND** `apply.instruction` in `schema.yaml` remains consistent with that file name

#### Scenario: Prepare-file templates removed

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/execution-context.md` and `templates/publish-plan.md` do not exist
- **AND** `apply.instruction` does not reference them
