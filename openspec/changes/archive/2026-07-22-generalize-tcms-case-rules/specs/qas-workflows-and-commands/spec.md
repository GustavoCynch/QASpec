# qas-workflows-and-commands Delta

## MODIFIED Requirements

### Requirement: Cases workflow behavior

The `qaspec-cases` skill and `/qsx:cases` command SHALL verify the analyze approval state via `qaspec status --change --json` before reading sources and halt for re-approval when it is `stale` or `missing`, produce `testcases.md` with mandatory checkboxes and, for each case, a `req` traceability annotation plus preconditions and steps with action and expected result built from sources in hand, read the approved change delta specs under `specs/**/*.md` as binding input for the case list, read `qaspec/references/tcms_case_rules.md`, read `qaspec/specs/<capability>/spec.md` for capabilities listed in `analysis.md` when present, treat user-validated `analysis.md` and the approved delta specs as the source of truth over PR diff or current implementation when they conflict, honor `workflow.multipleSubagents.cases` from `qaspec/config.yaml` (default **false** when unset), use dual blind analyst Task synthesis for draft lists only when that flag is **true** (drafts grouped by requirement slug, merged as a keyed union with recorded discards), otherwise draft cases in the orchestrator without Task subagents, run `qaspec validate cases --change <name>` to a passing result before the halt, and halt once for human approval of the case list including the validator's coverage summary.
(Previously: mandatory-references block read `qaspec/references/qase_test_case_rules.md`.)

#### Scenario: Approval verified before drafting

- **WHEN** the agent starts the cases phase and the approval state is `stale` or `missing`
- **THEN** the agent reports what changed (content or PR head) and asks the user to re-approve
- **AND** does not draft `testcases.md` in that message

#### Scenario: Case list format

- **WHEN** cases output is written
- **THEN** each test case is a single `- [ ]` line with observable title text under a `##` suite heading and a `<!-- req: ... -->` annotation
- **AND** immediately below that line the case includes **Preconditions** and **Steps** blocks per the schema template

#### Scenario: Cases consume approved delta specs

- **WHEN** the agent runs the cases phase
- **THEN** the agent reads the change `specs/**/*.md` files in full before drafting cases
- **AND** every requirement in those specs maps to at least one annotated case, verified by `qaspec validate cases`
- **AND** the agent does not create or update `specs/**/*.md` unless a user clarification during the cases conversation changes agreed behavior

#### Scenario: Validation gates the halt

- **WHEN** the agent finishes drafting `testcases.md` and `qaspec validate cases` reports failures
- **THEN** the agent fixes the reported issues and re-runs validation before presenting the halt
- **AND** the halt message includes the passing coverage summary

#### Scenario: Single halt for the case list

- **WHEN** the cases phase ends awaiting user approval
- **THEN** the agent asks exactly one question covering approval of the case list
- **AND** the agent does not start publish or Qase MCP in the same message

#### Scenario: analysis.md and specs override diff in cases phase

- **WHEN** the agent runs the cases phase and `analysis.md` or the approved delta specs document expected behavior or a known defect that differs from the PR diff or current code
- **THEN** the agent reads `analysis.md` and the delta specs in full before fetching the change set
- **AND** test cases reflect the agreed requirements, not accidental implementation
- **AND** known defects are tested as corrected behavior, not encoded as accepted SHALL/MUST requirements

#### Scenario: Assumption-derived cases are labeled

- **WHEN** a case derives from an entry in **Unvalidated assumptions** rather than a validated fact or spec requirement
- **THEN** its annotation is `assumption:<id>` referencing that entry

#### Scenario: Chat iteration updates affected artifacts

- **WHEN** the user requests case changes after the initial cases draft
- **THEN** the agent updates `testcases.md` in the same conversation without requiring a separate slash command
- **AND** re-runs `qaspec validate cases` before re-presenting the list

#### Scenario: Cases iteration updates analysis and specs when behavior agreement changes

- **WHEN** the user clarifies defect vs expected behavior or other agreed facts after the cases draft
- **THEN** the agent updates `analysis.md` (especially **Validated clarifications**) and affected `specs/**/*.md` before updating `testcases.md`
- **AND** re-records the analyze approval so the ledger matches the updated artifacts

#### Scenario: No invented vague steps

- **WHEN** the agent drafts case steps
- **THEN** each action and expected result uses concrete UI labels, URLs, data, or API behavior found in sources read for this change
- **AND** generic placeholder steps are used only when sources lack actionable detail and the case is annotated `req: gap`

#### Scenario: Dual analysts when cases flag true

- **WHEN** `workflow.multipleSubagents.cases` is **true** and the Task tool is available
- **THEN** the agent runs two parallel blind Task subagents whose drafts return cases grouped by requirement slug
- **AND** the merge is a keyed union per slug, with discarded drafts and the reason recorded in the conversation

#### Scenario: Orchestrator-only when cases flag false

- **WHEN** `workflow.multipleSubagents.cases` is **false** or omitted (default)
- **THEN** the orchestrator drafts cases without Task subagents
- **AND** the workflow does not delegate to a single subagent as a substitute

### Requirement: Publish workflow behavior

The `qaspec-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, read completed `specs/**/*.md` for context before MCP when files exist, resolve the TCMS target (provider, project code, base URL) per change via `qaspec tcms show` (change `.openspec.yaml` `tcms` block merged over project-config defaults), run `qaspec publish-gate --change <name>` and resolve any unmet preconditions before the summary, present an in-chat publish summary derived from unchecked cases in `testcases.md` (or legacy `testmatrix.md` when only that file exists) including the full Qase payload of one representative case, halt once for the user to confirm or adjust scope, and only after explicit confirmation — citing the current gate token — call Qase via MCP and mark each published case `- [x]` in the tracked cases file immediately after its successful create call. Checkbox marks SHALL be the only local publish tracking; the skill SHALL NOT write `publish-log.md`. On re-run with unchecked cases, the agent SHALL reconcile against existing Qase cases by title before creating and SHALL never blind-create; a legacy `publish-log.md` in the change directory SHALL be ignored. Qase fields without an entry in the project's field mapping SHALL be omitted or sent with the documented default, never inferred. The prepare step SHALL NOT write `publish-plan.md` or `execution-context.md`.
(Previously: the confirm-then-MCP scenario mapped fields per `qase_test_case_rules.md`.)

#### Scenario: Target resolved from change metadata

- **GIVEN** the change's `.openspec.yaml` resolves a usable `tcms` target (directly or filled by project-config defaults)
- **WHEN** the user runs `/qsx:publish`
- **THEN** the agent uses that target without asking prerequisite questions
- **AND** proceeds directly to the gate, the publish summary, and single confirm halt

#### Scenario: Publish blocked without specs

- **WHEN** `testcases.md` exists but no files exist under the change `specs/` directory and the schema apply phase requires `specs`
- **THEN** the agent does not invoke Qase MCP
- **AND** the agent directs the user to complete `/qsx:analyze` (or author deltas) before publish

#### Scenario: Gate failure blocks the upload path

- **WHEN** `qaspec publish-gate` exits non-zero
- **THEN** the agent does not invoke Qase MCP
- **AND** reports each unmet precondition with the command that resolves it

#### Scenario: In-chat summary before confirm

- **WHEN** the TCMS target is known and the gate passes
- **THEN** the agent presents in chat: the target (provider, project, base URL), each suite with its unchecked-case count, warnings (cases without **Steps** blocks, suspected PII), and the full payload of one representative case
- **AND** the summary is derived from `testcases.md` at that moment, with no plan file written
- **AND** the agent asks exactly one confirmation question and does not call Qase MCP in the same message

#### Scenario: MCP only after confirmation with gate token

- **WHEN** the user confirms publish after the summary halt
- **THEN** the agent cites the current gate token, re-reads `testcases.md`, and maps case **Preconditions** and **Steps** to Qase fields per `tcms_case_rules.md` without replacing steps with newly invented steps based only on titles
- **AND** after each successful MCP create the agent marks that case `- [x]` in `testcases.md`
- **AND** no `publish-log.md` or other per-case trace file is written
- **AND** fields without a mapping entry are omitted or defaulted, never inferred

#### Scenario: Interrupted publish resumes without duplicates

- **GIVEN** a previous publish attempt left unchecked cases in `testcases.md`
- **WHEN** the user runs `/qsx:publish` again and confirms
- **THEN** the agent checks each unchecked case against existing Qase cases by title before creating
- **AND** cases found in Qase are marked `- [x]` without a duplicate create call

#### Scenario: Legacy publish log is ignored

- **GIVEN** a change directory contains a `publish-log.md` from an earlier QASpec version
- **WHEN** the user runs `/qsx:publish`
- **THEN** the agent ignores the file and derives publish scope only from unchecked cases in `testcases.md`

#### Scenario: Scope edits after the halt

- **WHEN** the user requests scope or case changes after the summary halt
- **THEN** the agent updates `testcases.md` (the single source of truth) or records agreed exclusions, re-runs the gate, re-presents the summary, and asks again for confirm before MCP

#### Scenario: Publish from legacy in-flight change

- **GIVEN** a change created before the rename contains `testmatrix.md` and no `testcases.md`
- **WHEN** the user runs `/qsx:publish`
- **THEN** publish reads and tracks `testmatrix.md` as the case source
- **AND** a notice suggests renaming the file to `testcases.md`
