# qaspec-pr-review-schema Specification

## Purpose

Define the QASpec QA workflow schema: artifact graph, templates, and publish tracking for PR review cycles.
## Requirements
### Requirement: Schema identity and validation

The system SHALL ship a schema named `qaspec-pr-review` that validates successfully via `openspec schema validate qaspec-pr-review`.

#### Scenario: Schema validates on install

- **WHEN** a maintainer runs schema validation for `qaspec-pr-review`
- **THEN** validation succeeds with no errors
- **AND** the schema is loadable from the packaged `schemas/qaspec-pr-review/` directory

### Requirement: Specs artifact co-produced in analyze phase

The schema SHALL define artifact `specs` that generates `specs/**/*.md`, requires `analyze`, is co-produced in the analyze phase alongside `analysis.md`, and uses the same delta format as spec-driven (ADDED, MODIFIED, REMOVED, RENAMED). Packaged templates SHALL be consistent with co-production: no template text may direct agents to defer delta specs to the cases phase.

#### Scenario: Specs ready after analysis

- **WHEN** `analysis.md` exists for a change using `qaspec-pr-review`
- **THEN** artifact `specs` is ready
- **AND** `openspec instructions specs` resolves output patterns under `specs/<capability>/spec.md` in the change directory

#### Scenario: Specs template and main-spec baseline

- **WHEN** an agent creates delta specs for this change
- **THEN** instructions require reading existing `openspec/specs/<capability>/spec.md` for each affected capability before MODIFIED blocks
- **AND** the packaged template `schemas/qaspec-pr-review/templates/spec.md` follows spec-driven delta structure

#### Scenario: Analyze phase instruction coupling

- **WHEN** schema instructions for `analyze` and `specs` are loaded
- **THEN** `analyze` instructs co-creation or update of `specs/**/*.md` in the same phase as `analysis.md`
- **AND** `specs` instructs alignment with agreed behavior in `analysis.md` (especially **Validated clarifications** and **Functional intent vs implementation**)

#### Scenario: Analysis template consistent with co-production

- **WHEN** a maintainer opens `schemas/qaspec-pr-review/templates/analysis.md`
- **THEN** no comment or placeholder forbids writing `specs/**/*.md` in the analyze step
- **AND** the **Affected capabilities** guidance refers to delta specs co-produced in the analyze phase

### Requirement: Analyze artifact

The schema SHALL define artifact `analyze` that generates `analysis.md` with no upstream dependencies, SHALL instruct agents to co-produce change delta specs under `specs/**/*.md` in the same phase after reading existing `qaspec/specs/<capability>/spec.md` for each affected capability, SHALL end the phase with one approval digest halt covering both `analysis.md` and the delta specs, and artifact instructions SHALL defer dual analyst Task delegations to `workflow.multipleSubagents.review` in project config (orchestrator-only when false, heterogeneous dual analysts when true).

The approval digest SHALL summarize the drafted requirement headings and list every inference the agent made without user input in an **Unvalidated assumptions** section ordered by risk, accompanied by zero to three targeted questions; fabricating a question when no genuine ambiguity exists is forbidden. **Validated clarifications** SHALL contain only facts the user explicitly addressed. After the user approves, instructions SHALL direct the agent to record the approval via `qaspec approve analyze` (including the PR head SHA when known).

When the PR description and developer notes are missing or non-substantive, instructions SHALL require recording `Functional intent: ABSENT` in the intent section, forbid reconstructing intent from the diff, and make obtaining intent the first halt question.

#### Scenario: First artifact in a new change

- **WHEN** a user creates a change with schema `qaspec-pr-review`
- **THEN** `analyze` is available as the first ready artifact
- **AND** `openspec instructions analyze` resolves output to `analysis.md` under the change directory

#### Scenario: Affected capabilities seed specs in the same phase

- **WHEN** `analysis.md` is created
- **THEN** the artifact includes an **Affected capabilities** section with kebab-case capability names
- **AND** instructions require creating or updating `specs/<capability>/spec.md` deltas for testable behavior in the same phase, before the halt

#### Scenario: Analyze reads existing capability specs

- **WHEN** analyze instructions are generated for a change whose affected capabilities have existing `qaspec/specs/<capability>/spec.md` files
- **THEN** instructions require reading each existing capability spec before writing the analysis and delta specs
- **AND** MODIFIED delta blocks copy the full requirement from the existing spec before editing

#### Scenario: Approval digest halt covers analysis and specs

- **WHEN** the analyze phase ends awaiting user input
- **THEN** the agent presents an approval digest summarizing requirement headings and the **Unvalidated assumptions** list
- **AND** the agent asks at most three targeted questions, or states that no blocking question exists and requests digest approval
- **AND** user clarifications after the halt update both `analysis.md` (**Validated clarifications**) and affected `specs/**/*.md` files

#### Scenario: Validated clarifications restricted to user-addressed facts

- **WHEN** the agent persists clarifications after the halt
- **THEN** **Validated clarifications** contains only facts the user explicitly confirmed or corrected
- **AND** inferences the user did not address remain in **Unvalidated assumptions**

#### Scenario: Approval recorded after user approval

- **WHEN** the user approves the analyze digest
- **THEN** instructions direct the agent to run `qaspec approve analyze --change <name>` with the PR head SHA when known
- **AND** the agent reports the recorded approval to the user

#### Scenario: Absent intent is never fabricated

- **WHEN** the PR description and developer notes are missing or non-substantive
- **THEN** `analysis.md` records `Functional intent: ABSENT` in the intent section
- **AND** the agent does not present diff-derived behavior as the functional intent
- **AND** the first halt question asks the user for the intended behavior

#### Scenario: Analyze instructions respect subagent flag

- **WHEN** `qaspec instructions analyze --json` is run for a project with `workflow.multipleSubagents.review: false`
- **THEN** enriched instructions tell the agent not to use Task subagents for analyze
- **WHEN** the same command runs with `review: true`
- **THEN** enriched instructions require two parallel Task delegations with heterogeneous briefs (intent-first without the diff; implementation-first without the description) and synthesis notes comparing predicted versus reconstructed behavior

### Requirement: Test cases artifact with checkbox template

The schema SHALL define artifact `test-cases` that generates `testcases.md`, requires `analyze` and `specs`, instructs agents to verify the analyze approval state before drafting and halt on `stale` or `missing`, read the change delta specs as binding input for the case list, annotate every case with `<!-- req: ... -->` traceability (`capability/requirement-slug`, `assumption:<id>`, or `gap`), SHALL require each test case to include preconditions and numbered steps with action and expected result derived from available sources (not invented), SHALL require a passing `qaspec validate cases` run before the approval halt, and artifact instructions SHALL defer dual blind Task delegations for draft lists to `workflow.multipleSubagents.cases` in project config (orchestrator-only when false, dual analysts when true).

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

### Requirement: Publish-side artifact templates

The schema package SHALL NOT include publish-side trace or prepare templates: `publish-log.md`, `execution-context.md`, and `publish-plan.md` MUST NOT exist under `schemas/qaspec-pr-review/templates/`, and `apply.instruction` in `schema.yaml` MUST NOT reference them.

#### Scenario: Publish trace and prepare templates removed

- **WHEN** a maintainer lists templates for `qaspec-pr-review`
- **THEN** `templates/publish-log.md`, `templates/execution-context.md`, and `templates/publish-plan.md` do not exist
- **AND** `apply.instruction` does not reference any of them

### Requirement: No mandatory intake artifact

The schema SHALL NOT require an `intake.md` or separate `tasks.md` for the QA cycle.

#### Scenario: QA artifact graph

- **WHEN** a user inspects the artifact graph for `qaspec-pr-review`
- **THEN** artifacts `analyze`, `test-cases`, and `specs` are required before publish
- **AND** the dependency shape is `analyze` → `specs` → `test-cases` → publish with both cases-side outputs required for apply
- **AND** there is no artifact id `intake` in the graph

### Requirement: Legacy testmatrix tracking fallback

For changes created before the rename, progress tracking and publish SHALL fall back to `testmatrix.md` when `testcases.md` does not exist in the change directory, emitting a one-line notice that suggests renaming the file. New writes SHALL always target `testcases.md`.

#### Scenario: Status on a legacy in-flight change

- **GIVEN** a change directory contains `testmatrix.md` and no `testcases.md`
- **WHEN** `openspec status` runs for that change
- **THEN** checkbox progress is reported from `testmatrix.md`
- **AND** a notice suggests `git mv testmatrix.md testcases.md`

#### Scenario: New change uses the new file only

- **WHEN** a change is created after the rename and the cases phase runs
- **THEN** the artifact is written to `testcases.md`
- **AND** no `testmatrix.md` is created

### Requirement: Legacy analisis filename fallback

For changes created before the rename, dependency resolution and instruction loading SHALL fall back to `analisis.md` when `analysis.md` does not exist in the change directory, emitting a one-line notice that suggests renaming the file. New writes SHALL always target `analysis.md`, and when both files exist the new name wins.

#### Scenario: Cases phase on a legacy change

- **GIVEN** a change directory contains `analisis.md` and no `analysis.md`
- **WHEN** instructions for `test-cases` or `specs` are loaded
- **THEN** the analyze dependency is considered satisfied and the legacy file is the read source
- **AND** a notice suggests `git mv analisis.md analysis.md`

#### Scenario: New change uses the new file only

- **WHEN** a change is created after the rename and the analyze phase runs
- **THEN** the artifact is written to `analysis.md`
- **AND** no `analisis.md` is created

