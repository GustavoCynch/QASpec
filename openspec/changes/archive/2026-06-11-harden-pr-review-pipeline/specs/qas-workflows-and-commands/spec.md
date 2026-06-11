# qas-workflows-and-commands Specification (delta)

## MODIFIED Requirements

### Requirement: Analyze workflow behavior

The `qaspec-analyze` skill and `/qsx:analyze` command SHALL produce `analysis.md` and co-produced change delta specs under `specs/**/*.md` in the same phase, require reading `qaspec/references/historical_bugs.md`, require reading existing `qaspec/specs/<capability>/spec.md` for each affected capability when present (baseline for MODIFIED deltas and context for previously reviewed functionality), honor `workflow.multipleSubagents.review` from `qaspec/config.yaml` (default **false** when unset), use heterogeneous dual analyst Task synthesis only when that flag is **true**, otherwise perform the analyze phase entirely in the orchestrator without Task subagents, include an **Affected capabilities** section in `analysis.md` using kebab-case names, and end with one approval digest halt — requirement headings, the **Unvalidated assumptions** list, and zero to three targeted questions — covering both `analysis.md` and the delta specs before cases work in the same turn. After the user approves, the skill SHALL direct the agent to record the approval via `qaspec approve analyze --change <name>` with the PR head SHA when known. When the PR description and developer notes are missing or non-substantive, the skill SHALL direct the agent to record `Functional intent: ABSENT`, not reconstruct intent from the diff, and make obtaining intent the first halt question.

#### Scenario: Analyze references path

- **WHEN** the agent runs analyze for a project initialized by QASpec
- **THEN** instructions point to `qaspec/references/historical_bugs.md` using path.join-safe resolution from project root

#### Scenario: Analyze co-produces delta specs

- **WHEN** analyze completes with a halt and the change introduces or modifies testable behavior
- **THEN** `analysis.md` exists
- **AND** the change contains or updates at least one `specs/<capability>/spec.md` delta aligned with the analysis

#### Scenario: Analyze reads existing capability specs

- **WHEN** the agent runs analyze for functionality whose capabilities already have `qaspec/specs/<capability>/spec.md` files
- **THEN** the agent reads each existing capability spec before writing `analysis.md` and the delta specs
- **AND** the analysis accounts for previously agreed behavior, and MODIFIED deltas copy the full requirement block from the existing spec before editing

#### Scenario: Approval digest halt covers analysis and specs

- **WHEN** the analyze phase ends awaiting user approval
- **THEN** the agent presents the approval digest with requirement headings and **Unvalidated assumptions** ordered by risk
- **AND** the agent asks at most three targeted questions, or states no blocking question exists and requests digest approval
- **AND** the agent does not start cases work in the same message

#### Scenario: Approval recorded after the user approves

- **WHEN** the user approves the analyze digest
- **THEN** the agent runs `qaspec approve analyze --change <name>` (with `--head-sha` when the PR head is known)
- **AND** announces the recorded approval

#### Scenario: Analyze persists clarifications in both artifacts

- **WHEN** the user answers the analyze halt or supplies clarifications after it
- **THEN** the agent updates `analysis.md` **Validated clarifications** with the facts the user explicitly addressed (and intent vs implementation when needed), leaving unaddressed inferences in **Unvalidated assumptions**
- **AND** updates affected `specs/**/*.md` files so requirements reflect the clarified intent
- **AND** re-records the approval so the ledger matches the updated artifacts
- **AND** does not rely on chat-only text as the input for `/qsx:cases`

#### Scenario: Absent intent halts for the user

- **WHEN** the PR description and developer notes are missing or non-substantive
- **THEN** `analysis.md` records `Functional intent: ABSENT — no independent intent source`
- **AND** the first halt question asks the user for the intended behavior instead of presenting diff-derived intent

#### Scenario: Heterogeneous dual analysts when review flag true

- **WHEN** `workflow.multipleSubagents.review` is **true** and the Task tool is available
- **THEN** the agent runs two parallel Task subagents with asymmetric briefs: an intent-first analyst (PR description, developer notes, linked issues, baseline specs — no diff) and an implementation-first analyst (diff and code — no description)
- **AND** **Synthesis notes** compare predicted versus reconstructed behavior, flagging each divergence as an intent-vs-implementation candidate
- **AND** findings reported by only one analyst trigger a targeted verification instead of automatic confidence downgrade

#### Scenario: Orchestrator-only when review flag false

- **WHEN** `workflow.multipleSubagents.review` is **false** or omitted (default)
- **THEN** the orchestrator fetches the change set and writes `analysis.md` and delta specs without invoking Task subagents
- **AND** the workflow does not delegate to a single subagent as a substitute

### Requirement: Cases workflow behavior

The `qaspec-cases` skill and `/qsx:cases` command SHALL verify the analyze approval state via `qaspec status --change --json` before reading sources and halt for re-approval when it is `stale` or `missing`, produce `testcases.md` with mandatory checkboxes and, for each case, a `req` traceability annotation plus preconditions and steps with action and expected result built from sources in hand, read the approved change delta specs under `specs/**/*.md` as binding input for the case list, read `qaspec/references/qase_test_case_rules.md`, read `qaspec/specs/<capability>/spec.md` for capabilities listed in `analysis.md` when present, treat user-validated `analysis.md` and the approved delta specs as the source of truth over PR diff or current implementation when they conflict, honor `workflow.multipleSubagents.cases` from `qaspec/config.yaml` (default **false** when unset), use dual blind analyst Task synthesis for draft lists only when that flag is **true** (drafts grouped by requirement slug, merged as a keyed union with recorded discards), otherwise draft cases in the orchestrator without Task subagents, run `qaspec validate cases --change <name>` to a passing result before the halt, and halt once for human approval of the case list including the validator's coverage summary.

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

The `qaspec-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, read completed `specs/**/*.md` for context before MCP when files exist, resolve the TCMS target (provider, project code, base URL) from the `tcms` block in `qaspec/config.yaml`, run `qaspec publish-gate --change <name>` and resolve any unmet preconditions before the summary, present an in-chat publish summary derived from unchecked cases in `testcases.md` (or legacy `testmatrix.md` when only that file exists) including the full Qase payload of one representative case, halt once for the user to confirm or adjust scope, and only after explicit confirmation — citing the current gate token — write the write-ahead rows to `publish-log.md`, call Qase via MCP, update each row with the returned ID, and mark published rows in the tracked cases file. On re-run with pending or in-flight rows, the agent SHALL reconcile against Qase by recorded ID or title before creating. Qase fields without an entry in the project's field mapping SHALL be omitted or sent with the documented default, never inferred. The prepare step SHALL NOT write `publish-plan.md` or `execution-context.md`.

#### Scenario: Target resolved from project config

- **GIVEN** `qaspec/config.yaml` contains a `tcms` block with provider, project code, and base URL
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
- **THEN** the agent cites the current gate token, writes all planned rows to `publish-log.md` as pending, then re-reads `testcases.md` and maps case **Preconditions** and **Steps** to Qase fields per `qase_test_case_rules.md` without replacing steps with newly invented steps based only on titles
- **AND** after each successful MCP create the agent records the returned case ID, sets the row to done, and marks the row `- [x]` in `testcases.md`
- **AND** fields without a mapping entry are omitted or defaulted, never inferred

#### Scenario: Interrupted publish resumes without duplicates

- **GIVEN** `publish-log.md` contains pending or in-flight rows from a previous attempt
- **WHEN** the user runs `/qsx:publish` again and confirms
- **THEN** the agent looks up each such case in Qase by recorded ID or title before creating
- **AND** cases found in Qase are marked done and `- [x]` without a duplicate create call

#### Scenario: Scope edits after the halt

- **WHEN** the user requests scope or case changes after the summary halt
- **THEN** the agent updates `testcases.md` (the single source of truth) or records agreed exclusions, re-runs the gate, re-presents the summary, and asks again for confirm before MCP

#### Scenario: Publish from legacy in-flight change

- **GIVEN** a change created before the rename contains `testmatrix.md` and no `testcases.md`
- **WHEN** the user runs `/qsx:publish`
- **THEN** publish reads and tracks `testmatrix.md` as the case source
- **AND** a notice suggests renaming the file to `testcases.md`
