# qas-workflows-and-commands — delta for remove-publish-log

## MODIFIED Requirements

### Requirement: Publish workflow behavior

The `qaspec-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, read completed `specs/**/*.md` for context before MCP when files exist, resolve the TCMS target (provider, project code, base URL) per change via `qaspec tcms show` (change `.openspec.yaml` `tcms` block merged over project-config defaults), run `qaspec publish-gate --change <name>` and resolve any unmet preconditions before the summary, present an in-chat publish summary derived from unchecked cases in `testcases.md` (or legacy `testmatrix.md` when only that file exists) including the full Qase payload of one representative case, halt once for the user to confirm or adjust scope, and only after explicit confirmation — citing the current gate token — call Qase via MCP and mark each published case `- [x]` in the tracked cases file immediately after its successful create call. Checkbox marks SHALL be the only local publish tracking; the skill SHALL NOT write `publish-log.md`. On re-run with unchecked cases, the agent SHALL reconcile against existing Qase cases by title before creating and SHALL never blind-create; a legacy `publish-log.md` in the change directory SHALL be ignored. Qase fields without an entry in the project's field mapping SHALL be omitted or sent with the documented default, never inferred. The prepare step SHALL NOT write `publish-plan.md` or `execution-context.md`.

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
- **THEN** the agent cites the current gate token, re-reads `testcases.md`, and maps case **Preconditions** and **Steps** to Qase fields per `qase_test_case_rules.md` without replacing steps with newly invented steps based only on titles
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
