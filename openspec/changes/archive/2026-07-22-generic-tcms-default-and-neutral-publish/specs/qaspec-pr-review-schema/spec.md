# qaspec-pr-review-schema Delta

## MODIFIED Requirements

### Requirement: Test cases artifact with checkbox template

The schema SHALL define artifact `test-cases` that generates `testcases.md`, requires `analyze` and `specs`, instructs agents to verify the analyze approval state before drafting and halt on `stale` or `missing`, read the change delta specs as binding input for the case list, annotate every case with `<!-- req: ... -->` traceability (`capability/requirement-slug`, `assumption:<id>`, or `gap`), SHALL require each test case to include preconditions and numbered steps with action and expected result derived from available sources (not invented), SHALL require a passing `qaspec validate cases` run before the approval halt, and artifact instructions SHALL defer dual blind Task delegations for draft lists to `workflow.multipleSubagents.cases` in project config (orchestrator-only when false, dual analysts when true).
(Previously: the enriched-case scenario allowed empty expected results per a vendor-named rules reference.)

#### Scenario: Cases depend on analysis and specs

- **WHEN** `analysis.md` exists and at least one file exists under `specs/` for the change
- **THEN** `test-cases` becomes ready
- **AND** the template instructs authors to use `- [ ]` checkboxes grouped under `##` suite headings

#### Scenario: Progress parsing

- **WHEN** `openspec status` runs for a change using this schema
- **THEN** checkbox progress in `testcases.md` is reported the same way as `tasks.md` in `spec-driven`
- **AND** only lines matching the checkbox pattern count toward progress (nested case detail does not add extra checkboxes)

#### Scenario: Approval verified before drafting

- **WHEN** cases instructions are generated for a change
- **THEN** instructions require checking the analyze approval state via `qaspec status --json` before reading sources
- **AND** instructions direct the agent to halt and request re-approval when the state is `stale` or `missing`

#### Scenario: Cases consume approved delta specs

- **WHEN** cases instructions are generated for a change
- **THEN** instructions require reading the change `specs/**/*.md` files and `qaspec/specs/<capability>/spec.md` for capabilities listed in `analysis.md` when those files exist
- **AND** instructions require annotating every case with its `req` traceability value
- **AND** instructions do not direct the agent to create or update `specs/**/*.md` in this phase

#### Scenario: Validation gates the halt

- **WHEN** the agent finishes drafting `testcases.md`
- **THEN** instructions require running `qaspec validate cases --change <name>` and fixing failures before the approval halt
- **AND** the halt message includes the validator's coverage summary

#### Scenario: Enriched case body under checkbox line

- **WHEN** an agent writes or updates `testcases.md` for a case
- **THEN** the case includes a **Preconditions** block with the standard environment and role prefix plus case-specific preconditions
- **AND** the case includes a **Steps** block where each step has an observable **Action** and **Expected** result (empty expected allowed only for transition steps per TCMS case rules)
- **AND** step 1 is navigation to the base URL when a URL is known from sources or execution context

#### Scenario: Steps traceable to sources

- **WHEN** cases instructions are loaded for `test-cases`
- **THEN** instructions require building preconditions and steps from `analysis.md`, the change delta specs, the change set (PR diff or patch), referenced requirements, `qaspec/specs/<capability>/spec.md`, and observable UI/API detail from read sources
- **AND** instructions forbid vague invented flows (e.g. generic "use any available flow") unless sources lack actionable detail
- **AND** when a generic step is used due to missing detail, instructions require documenting the gap (annotation `req: gap` plus an HTML comment describing what is missing)

#### Scenario: Template demonstrates enriched format

- **WHEN** a maintainer opens `schemas/qaspec-pr-review/templates/testcases.md`
- **THEN** the template shows at least one full example case with **Preconditions**, **Steps**, and a `req` annotation under a checkbox line
- **AND** the example aligns with `qaspec/references/tcms_case_rules.md` narrative rules

#### Scenario: Cases instructions respect subagent flag

- **WHEN** `qaspec instructions test-cases --json` runs for a project with `workflow.multipleSubagents.cases: false`
- **THEN** enriched instructions tell the agent not to use Task subagents for case drafting
- **WHEN** the same command runs with `cases: true`
- **THEN** enriched instructions require dual blind parallel Task delegations whose drafts are returned grouped by requirement slug and merged as a keyed union with recorded discards

### Requirement: Publish artifact and tracking

The schema SHALL define a publish phase that requires both `test-cases` and `specs`, tracks `testcases.md`, and SHALL instruct publish to resolve the TCMS target per change via `qaspec tcms show` (change `.qaspec.yaml` `tcms` block merged over project-config defaults) — defaulting to proposing a new TCMS project in one halt when no usable target exists, persisting the user's choice via `qaspec tcms set` and never writing the `tcms` block in `qaspec/config.yaml` — run `qaspec publish-gate` before the summary, present an in-chat summary of unchecked cases plus the full TCMS payload of one representative case before one confirmation halt, and use preconditions and steps recorded under each approved case in `testcases.md` when preparing TCMS payloads. Upload SHALL proceed only with the user's confirmation and the current gate token. Publish is MCP-only and provider-neutral: apply instructions SHALL reference the TCMS MCP and TCMS fields rather than a specific product, and MCP tool names MAY appear only as illustrative examples. Checkbox marks in `testcases.md` SHALL be the only local publish tracking: after each successful upload the agent marks that case `- [x]`. On any re-run the agent SHALL reconcile unchecked cases against existing TCMS cases by title before creating and SHALL never blind-create. TCMS fields not present in the project's field mapping SHALL be omitted or sent with the documented default, never inferred. The instruction SHALL NOT direct agents to write `publish-log.md`, `publish-plan.md`, or `execution-context.md`.
(Previously: instructions named the same vendor throughout the payload, cases, fields, MCP-upload, and create-case-payload wording.)

#### Scenario: Publish readiness

- **WHEN** `testcases.md` exists and at least one file exists under `specs/` for the change
- **THEN** the publish phase is ready to run
- **AND** `publish.tracks` is set to `testcases.md`

#### Scenario: Gate precedes the summary

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require running `qaspec publish-gate --change <name>` before presenting the publish summary
- **AND** instructions forbid the provider's TCMS MCP upload without citing the current gate token alongside the user's confirmation

#### Scenario: Summary and confirm before MCP

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require an in-chat summary (target, suites, unchecked-case counts, warnings) derived from `testcases.md`
- **AND** the summary includes the full payload of one representative case (fields as they will be sent)
- **AND** instructions require exactly one user confirmation halt after the summary
- **AND** instructions forbid MCP upload in the same message as TCMS target selection or persistence

#### Scenario: Apply instructions are provider-neutral

- **WHEN** apply-phase instructions for publish are generated from `schema.yaml`
- **THEN** the instruction text does not name a specific TCMS product in its MCP-call or field-mapping wording
- **AND** it refers to the TCMS MCP and TCMS fields generically, with any create tool name shown only as an example

#### Scenario: Checkbox marked after each upload

- **WHEN** the user confirms publish and a case is created in the TCMS via MCP
- **THEN** the agent marks that case `- [x]` in `testcases.md` immediately after the successful create call
- **AND** no `publish-log.md` or other per-case trace file is written

#### Scenario: Re-run reconciles instead of duplicating

- **GIVEN** a previous publish attempt left unchecked cases in `testcases.md`
- **WHEN** publish runs again and the user confirms
- **THEN** the agent checks each unchecked case against existing TCMS cases by title before creating
- **AND** cases already present in the TCMS are marked `- [x]` without a duplicate create call

#### Scenario: Publish reads case blocks from the case list

- **WHEN** apply-phase instructions run for publish
- **THEN** instructions require reading **Preconditions** and **Steps** under each unchecked case in `testcases.md` when building the provider's create-case payloads (e.g. a `create_case` tool)
- **AND** instructions forbid deriving steps solely from the case title when a **Steps** block exists for that case

#### Scenario: Unmapped fields are never inferred

- **WHEN** the agent builds a TCMS payload and a field has no entry in the project's field mapping reference
- **THEN** the field is omitted or sent with the documented default
- **AND** severity, priority, and type values are never invented by the agent
