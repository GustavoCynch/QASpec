# qas-workflows-and-commands Specification

## Purpose

Replace the default OpenSpec **core** agent surface with QASpec QA commands and skills for end users of the fork.
## Requirements
### Requirement: Upstream OpenSpec workflow artifacts are not replaced

When upstream OpenSpec is active in a project, QASpec init and update SHALL install only the QASpec core (`qaspec-*` skills and `qsx-*` commands) workflow surface and SHALL leave upstream `openspec-*` skills and `opsx-*` commands unchanged.

#### Scenario: Core profile beside upstream OpenSpec

- **GIVEN** upstream OpenSpec is active with `openspec-propose` and `openspec-apply-change` skills already installed
- **WHEN** the user runs `qaspec init` with the QASpec core profile
- **THEN** `qaspec-analyze`, `qaspec-cases`, `qaspec-publish`, and `qaspec-archive` skills are created or updated
- **AND** `openspec-propose` and `openspec-apply-change` skill files are not modified by QASpec

#### Scenario: Custom profile with legacy OpenSpec workflows

- **GIVEN** upstream OpenSpec is active
- **WHEN** the user selects a custom profile that includes `propose`, `apply`, or other `openspec-*` workflow ids
- **THEN** QASpec still does not overwrite existing upstream `openspec-*` skills or `opsx-*` commands
- **AND** QASpec `qaspec-*` skills for enabled QASpec workflows are still installed

### Requirement: Legacy custom profile upgrades to QASpec core

When global configuration still reflects the pre-QASpec OpenSpec core workflow set, the CLI SHALL migrate it to the QASpec `core` profile before installing workflow artifacts.

#### Scenario: Legacy four-workflow global config

- **WHEN** global config has `profile: custom` and workflows are exactly `propose`, `explore`, `apply`, `archive`
- **AND** the user runs `qaspec init` or `qaspec update`
- **THEN** global config becomes `profile: core` with workflows `analyze`, `cases`, `publish`, `archive`
- **AND** `qaspec-publish` skill and `/qsx:publish` command are generated when delivery includes skills and/or commands

### Requirement: Core workflow set

The QASpec product core profile SHALL install exactly these workflow ids: `analyze`, `cases`, `publish`, `archive`. Users whose global config was auto-migrated from the legacy OpenSpec core set SHALL receive this set on the next init or update without manual `qaspec config profile` steps.

#### Scenario: Init with core profile

- **WHEN** a user runs init with the QASpec core profile (including after legacy global-config migration)
- **THEN** skills are generated for all four workflow ids including `publish`
- **AND** workflows `explore`, `matrix`, `propose`, `apply`, `sync`, `ff`, `verify`, and `onboard` are not installed unless the user selects a custom/full profile that explicitly includes them

#### Scenario: Publish artifacts present after migration

- **WHEN** init or update runs after legacy profile migration
- **THEN** `.cursor/skills/qaspec-publish/SKILL.md` exists when skills delivery is enabled
- **AND** a publish command file exists under the tool commands directory (e.g. `.cursor/commands/qsx-publish.md`)

### Requirement: Skill directory naming

Each installed skill SHALL use the `qaspec-<workflow>` directory name under the tool skills folder.

#### Scenario: Cursor skills layout

- **WHEN** init configures Cursor with skills delivery
- **THEN** files exist at `.cursor/skills/qaspec-analyze/SKILL.md` (and siblings for cases, publish, archive)
- **AND** skill frontmatter `name` matches the directory (e.g. `qaspec-analyze`)

### Requirement: Slash command naming

Generated agent commands SHALL expose `/qsx:<workflow>` (colon form) for tools that use colon slash commands, including `publish`.

#### Scenario: Cursor command files

- **WHEN** init configures Cursor with commands delivery and the active profile includes `publish`
- **THEN** `qsx-publish.md` exists under `.cursor/commands/`
- **AND** frontmatter `name` is `/qsx:publish`

### Requirement: Project language for workflow output

QASpec workflow skills SHALL instruct agents to use the language from `openspec/config.yaml` `context` and per-artifact `rules` for all user-facing artifact text and halt messages. Skill bodies in `src/` remain English.

#### Scenario: Spanish QA project

- **WHEN** project config declares Spanish in `context`
- **THEN** `/qsx:analyze` produces `analysis.md` in Spanish
- **AND** the skill source file under `src/core/templates/workflows/` is still maintained in English

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

The `qaspec-cases` skill and `/qsx:cases` command SHALL verify the analyze approval state via `qaspec status --change --json` before reading sources and halt for re-approval when it is `stale` or `missing`, produce `testcases.md` with mandatory checkboxes and, for each case, a `req` traceability annotation plus preconditions and steps with action and expected result built from sources in hand, read the approved change delta specs under `specs/**/*.md` as binding input for the case list, read `qaspec/references/tcms_case_rules.md`, read `qaspec/specs/<capability>/spec.md` for capabilities listed in `analysis.md` when present, treat user-validated `analysis.md` and the approved delta specs as the source of truth over PR diff or current implementation when they conflict, honor `workflow.multipleSubagents.cases` from `qaspec/config.yaml` (default **false** when unset), use dual blind analyst Task synthesis for draft lists only when that flag is **true** (drafts grouped by requirement slug, merged as a keyed union with recorded discards), otherwise draft cases in the orchestrator without Task subagents, run `qaspec validate cases --change <name>` to a passing result before the halt, and halt once for human approval of the case list including the validator's coverage summary.

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
- **AND** the agent does not start publish or the provider's TCMS MCP in the same message

#### Scenario: Cases halt wording is provider-neutral

- **WHEN** the `qaspec-cases` template body is generated
- **THEN** the template does not name a specific TCMS product as the only publish target
- **AND** any MCP tool name in the template is framed as an illustrative example

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

### Requirement: Workflow skills document multipleSubagents config

Generated `qaspec-analyze` and `qaspec-cases` skills SHALL instruct agents to read `workflow.multipleSubagents.review` and `workflow.multipleSubagents.cases` from `qaspec/config.yaml` before choosing dual Task delegations versus orchestrator-only execution.

#### Scenario: Skill body mentions config keys

- **WHEN** `qaspec update` regenerates analyze and cases skills
- **THEN** each skill body references `workflow.multipleSubagents` with review and cases keys
- **AND** the skill states orchestrator-only behavior when the flag for that phase is false

### Requirement: Publish workflow behavior

The `qaspec-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, read completed `specs/**/*.md` for context before MCP when files exist, resolve the TCMS target (provider, project code, base URL) per change via `qaspec tcms show` (change `.qaspec.yaml` `tcms` block merged over project-config defaults), run `qaspec publish-gate --change <name>` and resolve any unmet preconditions before the summary, present an in-chat publish summary derived from unchecked cases in `testcases.md` (or legacy `testmatrix.md` when only that file exists) including the full TCMS payload of one representative case, halt once for the user to confirm or adjust scope, and only after explicit confirmation — citing the current gate token — call the provider's TCMS MCP and mark each published case `- [x]` in the tracked cases file immediately after its successful create call. Checkbox marks SHALL be the only local publish tracking; the skill SHALL NOT write `publish-log.md`. On re-run with unchecked cases, the agent SHALL reconcile against existing TCMS cases by title before creating and SHALL never blind-create; a legacy `publish-log.md` in the change directory SHALL be ignored. TCMS fields without an entry in the project's field mapping SHALL be omitted or sent with the documented default, never inferred. Publish is MCP-only and provider-neutral: the skill SHALL NOT name a specific TCMS product as the only target, and MCP tool names MAY appear only as illustrative examples. The prepare step SHALL NOT write `publish-plan.md` or `execution-context.md`.

#### Scenario: Target resolved from change metadata

- **GIVEN** the change's `.qaspec.yaml` resolves a usable `tcms` target (directly or filled by project-config defaults)
- **WHEN** the user runs `/qsx:publish`
- **THEN** the agent uses that target without asking prerequisite questions
- **AND** proceeds directly to the gate, the publish summary, and single confirm halt

#### Scenario: Publish blocked without specs

- **WHEN** `testcases.md` exists but no files exist under the change `specs/` directory and the schema apply phase requires `specs`
- **THEN** the agent does not invoke the provider's TCMS MCP
- **AND** the agent directs the user to complete `/qsx:analyze` (or author deltas) before publish

#### Scenario: Gate failure blocks the upload path

- **WHEN** `qaspec publish-gate` exits non-zero
- **THEN** the agent does not invoke the provider's TCMS MCP
- **AND** reports each unmet precondition with the command that resolves it

#### Scenario: In-chat summary before confirm

- **WHEN** the TCMS target is known and the gate passes
- **THEN** the agent presents in chat: the target (provider, project, base URL), each suite with its unchecked-case count, warnings (cases without **Steps** blocks, suspected PII), and the full payload of one representative case
- **AND** the summary is derived from `testcases.md` at that moment, with no plan file written
- **AND** the agent asks exactly one confirmation question and does not call the provider's TCMS MCP in the same message

#### Scenario: MCP only after confirmation with gate token

- **WHEN** the user confirms publish after the summary halt
- **THEN** the agent cites the current gate token, re-reads `testcases.md`, and maps case **Preconditions** and **Steps** to TCMS fields per `tcms_case_rules.md` without replacing steps with newly invented steps based only on titles
- **AND** after each successful MCP create the agent marks that case `- [x]` in `testcases.md`
- **AND** no `publish-log.md` or other per-case trace file is written
- **AND** fields without a mapping entry are omitted or defaulted, never inferred

#### Scenario: Publish wording is provider-neutral

- **WHEN** the `qaspec-publish` template body is generated
- **THEN** the template does not name a specific TCMS product in its publish, MCP-call, or field-mapping wording
- **AND** it refers to the TCMS target and the provider's MCP generically, with any tool name shown only as an example

#### Scenario: Interrupted publish resumes without duplicates

- **GIVEN** a previous publish attempt left unchecked cases in `testcases.md`
- **WHEN** the user runs `/qsx:publish` again and confirms
- **THEN** the agent checks each unchecked case against existing TCMS cases by title before creating
- **AND** cases found in the TCMS are marked `- [x]` without a duplicate create call

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

### Requirement: TCMS target discovery and persistence

When the change resolves no usable TCMS target, the publish workflow SHALL default to proposing the creation of a new TCMS project for the change (suggesting a code derived from the change or PR), present that recommendation together with existing projects discovered via MCP (when a listing tool exists) as alternatives in one halt, and wait for the user's choice — it SHALL NOT select an existing project on its own; reuse happens only when the user explicitly picks one. After the user chooses, it SHALL persist the target with `qaspec tcms set --change <name>` announcing the edit, SHALL NOT write the `tcms` block in `qaspec/config.yaml`, and SHALL NOT upload cases in the same message as target selection or creation.

#### Scenario: First publish without a target proposes a new project

- **GIVEN** the change resolves no usable TCMS target
- **WHEN** the user runs `/qsx:publish` with the provider's TCMS MCP available
- **THEN** the agent proposes creating a new project (with a suggested code) as the recommended option, listing existing projects only as alternatives, in a single halt
- **AND** the agent does not persist any target or pick an existing project before the user answers
- **AND** after the user picks, the agent persists the target via `qaspec tcms set` and says so
- **AND** the publish summary and confirm halt follow in a later message, never alongside the upload

#### Scenario: User chooses to create a new project

- **WHEN** the user selects "create new project" and the provider's TCMS MCP exposes a project-creation tool
- **THEN** the agent creates the project via MCP with a name and code the user approved
- **AND** persists the new project code via `qaspec tcms set --change <name>`

#### Scenario: User explicitly reuses an existing project

- **WHEN** the user picks an existing project from the alternatives in the halt
- **THEN** the agent persists that project via `qaspec tcms set --change <name>`
- **AND** `qaspec/config.yaml` is not modified

#### Scenario: Discovery degrades without optional MCP tools

- **WHEN** the provider's TCMS MCP lacks project listing or creation tools
- **THEN** the agent still proposes create-new first and asks for the project code in the same single halt instead of failing
- **AND** persists the provided value via `qaspec tcms set --change <name>`

#### Scenario: Legacy execution-context surfaces as an alternative

- **GIVEN** the change resolves no usable TCMS target and contains a legacy `execution-context.md` with project code and base URL
- **WHEN** the user runs `/qsx:publish`
- **THEN** the agent surfaces those values as one alternative in the same halt without auto-selecting them
- **AND** legacy `publish-plan.md` files are ignored and never required

### Requirement: Content migration from qa-pr-review

Workflow template bodies SHALL be derived from `.agents/skills/qa-pr-review/SKILL.md` phases (1→analyze, 2→cases, 3+4→publish). The pack MAY remain in the repository as a **reference-only** archive; it SHALL NOT be installed or advertised as the active QA workflow. Runtime QA behavior SHALL be available only via `qaspec-*` skills and `/qsx:*` commands from init (core profile), with project reference seeds under `qaspec/references/`.

#### Scenario: Reference pack retained in fork

- **WHEN** a contributor clones the QASpec fork
- **THEN** path `.agents/skills/qa-pr-review/` MAY exist with SKILL.md and `references/`
- **AND** SKILL.md or README states the pack is reference-only and superseded by `/qsx:analyze`, `/qsx:cases`, `/qsx:publish`
- **AND** the skill is not auto-invoked as a product workflow (e.g. `disable-model-invocation: true` or equivalent)

#### Scenario: No duplicate QA pack in core init

- **WHEN** init completes on a fresh repo with the QASpec core profile
- **THEN** core init does not install `qa-pr-review` as a managed workflow skill
- **AND** QASpec QA behavior is available via `qaspec-*` only
- **AND** init scaffolds `qaspec/references/` from bundled seeds, not by copying `.agents/skills/qa-pr-review/references/`

#### Scenario: Fork dogfooding uses spec-driven agent commands

- **WHEN** maintainers work on the CLI in this repository
- **THEN** they MAY use committed `opsx-*` / `openspec-*` commands under `.cursor/` for `spec-driven` changes
- **AND** absence of committed `qsx-*.md` under `.cursor/` does not indicate a product defect

### Requirement: Consumer install validation path

Maintainers SHALL validate QASpec agent output by running init in a temporary project directory, not by requiring `qaspec-*` or `qsx-*` command files in the fork’s `.cursor/` tree.

#### Scenario: Temp dir smoke after workflow changes

- **WHEN** a change touches QASpec workflow templates or command adapters
- **THEN** verification includes `qaspec init` in a temp directory
- **AND** the temp directory contains `.cursor/commands/qsx-analyze.md` and `.cursor/skills/qaspec-analyze/SKILL.md` when Cursor is selected
- **AND** the fork repository is not required to commit those generated files

### Requirement: Core profile product branding

The default QASpec **core** agent surface SHALL present QASpec in user-visible skill and command metadata.

#### Scenario: Core profile is QASpec

- **WHEN** a user initializes with the QASpec core profile
- **THEN** installed skills and commands SHALL present **QASpec** in names and descriptions visible to the user
- **AND** SHALL NOT describe the primary product as OpenSpec

### Requirement: Stale explore artifacts are cleaned up

`qaspec init` and `qaspec update` SHALL remove previously generated `qaspec-explore` skill directories and `qsx` explore command files from configured tools, while leaving upstream `openspec-explore` skills and `opsx-*` commands untouched when upstream OpenSpec is active.

#### Scenario: Update removes explore files from an existing project

- **GIVEN** a project initialized with an earlier version that generated `.cursor/skills/qaspec-explore/SKILL.md` and `.cursor/commands/qsx-explore.md`
- **WHEN** the user runs `qaspec update`
- **THEN** the `qaspec-explore` skill directory and the explore command file are deleted
- **AND** the remaining `qaspec-*` skills and `qsx-*` commands are regenerated normally

#### Scenario: Upstream explore skill is preserved

- **GIVEN** upstream OpenSpec is active with an `openspec-explore` skill installed
- **WHEN** `qaspec init` or `qaspec update` runs
- **THEN** the `openspec-explore` skill files are not modified or deleted

### Requirement: Retired workflow ids are ignored at resolution

When a global or project profile lists a retired QASpec workflow id (such as `explore`), workflow resolution SHALL skip it with a short notice pointing to `/qsx:analyze`, and generation SHALL continue for the remaining workflows without error.

#### Scenario: Custom profile still lists explore

- **GIVEN** global config has `profile: custom` with workflows `explore`, `analyze`, `cases`
- **WHEN** the user runs `qaspec init` or `qaspec update`
- **THEN** skills and commands are generated for `analyze` and `cases`
- **AND** a notice explains that `explore` was retired and investigation now starts with `/qsx:analyze`
- **AND** the command exits successfully

### Requirement: Renamed workflow ids map at resolution

When a global or project profile lists a renamed QASpec workflow id (such as `matrix`), workflow resolution SHALL map it to its current name (`cases`) with a short notice, deduplicate when both names are listed, and continue generation without error.

#### Scenario: Custom profile still lists matrix

- **GIVEN** global config has `profile: custom` with workflows `analyze`, `matrix`
- **WHEN** the user runs `qaspec init` or `qaspec update`
- **THEN** skills and commands are generated for `analyze` and `cases`
- **AND** a notice explains that `matrix` is now `cases`
- **AND** the command exits successfully

#### Scenario: Both old and new ids listed

- **GIVEN** a workflows list contains both `matrix` and `cases`
- **WHEN** workflow resolution runs
- **THEN** `cases` is generated once with no duplicate skills or commands

### Requirement: Stale matrix artifacts are cleaned up

`qaspec init` and `qaspec update` SHALL remove previously generated `qaspec-matrix` skill directories and `qsx` matrix command files from configured tools, while leaving upstream `openspec-*` skills and `opsx-*` commands untouched when upstream OpenSpec is active.

#### Scenario: Update removes matrix files from an existing project

- **GIVEN** a project initialized with an earlier version that generated `.cursor/skills/qaspec-matrix/SKILL.md` and `.cursor/commands/qsx-matrix.md`
- **WHEN** the user runs `qaspec update`
- **THEN** the `qaspec-matrix` skill directory and the matrix command file are deleted
- **AND** `qaspec-cases` skill and cases command file are generated in their place

