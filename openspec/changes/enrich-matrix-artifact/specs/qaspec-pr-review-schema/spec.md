## MODIFIED Requirements

### Requirement: Test matrix artifact with checkbox template

The schema SHALL define artifact `test-matrix` that generates `testmatrix.md`, requires `analyze`, instructs agents to produce or update change delta specs in the same phase as the matrix, and SHALL require each test case to include preconditions and numbered steps with action and expected result derived from available sources (not invented).

#### Scenario: Matrix depends on analysis

- **WHEN** `analisis.md` exists for the change
- **THEN** `test-matrix` becomes ready
- **AND** the template instructs authors to use `- [ ]` checkboxes grouped under `##` suite headings

#### Scenario: Progress parsing

- **WHEN** `openspec status` runs for a change using this schema
- **THEN** checkbox progress in `testmatrix.md` is reported the same way as `tasks.md` in `spec-driven`
- **AND** only lines matching the checkbox pattern count toward progress (nested case detail does not add extra checkboxes)

#### Scenario: Matrix references main specs

- **WHEN** matrix instructions are generated for a change
- **THEN** instructions require reading `openspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md` when those files exist

#### Scenario: Enriched case body under checkbox line

- **WHEN** an agent writes or updates `testmatrix.md` for a case
- **THEN** the case includes a **Preconditions** block with the standard environment and role prefix plus case-specific preconditions
- **AND** the case includes a **Steps** block where each step has an observable **Action** and **Expected** result (empty expected allowed only for transition steps per Qase rules)
- **AND** step 1 is navigation to the base URL when a URL is known from sources or execution context

#### Scenario: Steps traceable to sources

- **WHEN** matrix instructions are loaded for `test-matrix`
- **THEN** instructions require building preconditions and steps from `analisis.md`, the change set (PR diff or patch), referenced requirements, `qaspec/specs/<capability>/spec.md`, and observable UI/API detail from read sources
- **AND** instructions forbid vague invented flows (e.g. generic "use any available flow") unless sources lack actionable detail
- **AND** when a generic step is used due to missing detail, instructions require documenting the gap (e.g. HTML comment `<!-- gap: ... -->` or equivalent self-audit before halt)

#### Scenario: Template demonstrates enriched format

- **WHEN** a maintainer opens `schemas/qaspec-pr-review/templates/testmatrix.md`
- **THEN** the template shows at least one full example case with **Preconditions** and **Steps** under a checkbox line
- **AND** the example aligns with `qaspec/references/qase_test_case_rules.md` narrative rules

## MODIFIED Requirements

### Requirement: Publish artifact and tracking

The schema SHALL define a publish phase that requires both `test-matrix` and `specs`, tracks `testmatrix.md`, and SHALL instruct publish to use preconditions and steps recorded under each approved case in `testmatrix.md` when preparing Qase payloads.

#### Scenario: Publish readiness

- **WHEN** `testmatrix.md` exists and at least one file exists under `specs/` for the change
- **THEN** the publish phase is ready to run
- **AND** `publish.tracks` is set to `testmatrix.md`

#### Scenario: Publish outputs

- **WHEN** publish completes per schema instructions
- **THEN** the change MAY contain `publish-log.md`
- **AND** the change MAY contain `execution-context.md` when Qase prerequisites were collected
- **AND** the change SHALL contain `publish-plan.md` after the prepare step and before MCP upload

#### Scenario: Prepare step before MCP

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require writing `execution-context.md` and `publish-plan.md` before any Qase MCP call
- **AND** instructions require exactly one user confirmation halt after those files exist
- **AND** instructions forbid MCP upload in the same message as initial creation of those files

#### Scenario: Publish reads case blocks from matrix

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require reading **Preconditions** and **Steps** under each unchecked case in `testmatrix.md` when building `publish-plan.md` and Qase `create_case` payloads
- **AND** instructions forbid deriving steps solely from the case title when a **Steps** block exists for that case
