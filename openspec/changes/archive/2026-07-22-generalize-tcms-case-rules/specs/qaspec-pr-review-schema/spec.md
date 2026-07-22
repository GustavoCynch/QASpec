# qaspec-pr-review-schema Delta

## MODIFIED Requirements

### Requirement: Test cases artifact with checkbox template

The schema SHALL define artifact `test-cases` that generates `testcases.md`, requires `analyze` and `specs`, instructs agents to verify the analyze approval state before drafting and halt on `stale` or `missing`, read the change delta specs as binding input for the case list, annotate every case with `<!-- req: ... -->` traceability (`capability/requirement-slug`, `assumption:<id>`, or `gap`), SHALL require each test case to include preconditions and numbered steps with action and expected result derived from available sources (not invented), SHALL require a passing `qaspec validate cases` run before the approval halt, and artifact instructions SHALL defer dual blind Task delegations for draft lists to `workflow.multipleSubagents.cases` in project config (orchestrator-only when false, dual analysts when true).
(Previously: the enriched-format example referenced `qaspec/references/qase_test_case_rules.md`.)

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
