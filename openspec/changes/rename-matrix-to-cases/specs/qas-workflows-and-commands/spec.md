# qas-workflows-and-commands Delta

## RENAMED Requirements

- FROM: `### Requirement: Matrix workflow behavior`
- TO: `### Requirement: Cases workflow behavior`

## MODIFIED Requirements

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

### Requirement: Analyze workflow behavior

The `qaspec-analyze` skill and `/qsx:analyze` command SHALL produce `analisis.md`, require reading `qaspec/references/historical_bugs.md`, honor `workflow.multipleSubagents.review` from `qaspec/config.yaml` (default **false** when unset), use dual blind analyst Task synthesis only when that flag is **true**, otherwise perform the analyze phase entirely in the orchestrator without Task subagents, include an **Affected capabilities** section in `analisis.md` using kebab-case names, SHALL NOT write `specs/**/*.md` in the analyze step, and end with exactly one halt question before cases work in the same turn.

#### Scenario: Analyze references path

- **WHEN** the agent runs analyze for a project initialized by QASpec
- **THEN** instructions point to `qaspec/references/historical_bugs.md` using path.join-safe resolution from project root

#### Scenario: Analyze does not write specs

- **WHEN** analyze completes with a halt
- **THEN** `analisis.md` exists
- **AND** no new `specs/<capability>/spec.md` files are required from the analyze step alone

#### Scenario: Analyze persists clarifications for cases phase

- **WHEN** the user answers the analyze halt or supplies clarifications after it
- **THEN** the agent updates `analisis.md` **Validated clarifications** (and intent vs implementation when needed)
- **AND** does not rely on chat-only text as the input for `/qsx:cases`

#### Scenario: Dual analysts when review flag true

- **WHEN** `workflow.multipleSubagents.review` is **true** and the Task tool is available
- **THEN** the agent runs two parallel blind Task subagents with identical analyst briefs before writing user-visible `analisis.md`
- **AND** **Synthesis notes** document Agreed / Single-analyst / Contradiction merge

#### Scenario: Orchestrator-only when review flag false

- **WHEN** `workflow.multipleSubagents.review` is **false** or omitted (default)
- **THEN** the orchestrator fetches the change set and writes `analisis.md` without invoking Task subagents
- **AND** the workflow does not delegate to a single subagent as a substitute

### Requirement: Cases workflow behavior

The `qaspec-cases` skill and `/qsx:cases` command SHALL produce `testcases.md` with mandatory checkboxes and, for each case, preconditions plus steps with action and expected result built from sources in hand, create or update change delta specs under `specs/**/*.md` in the same phase, read `qaspec/references/qase_test_case_rules.md`, read `openspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md` when present, treat user-validated `analisis.md` as the source of truth over PR diff or current implementation when they conflict, honor `workflow.multipleSubagents.cases` from `qaspec/config.yaml` (default **false** when unset), use dual blind analyst Task synthesis for draft lists only when that flag is **true**, otherwise draft cases and specs in the orchestrator without Task subagents, and halt once for human approval of **both** the case list and the requirements.

#### Scenario: Case list format

- **WHEN** cases output is written
- **THEN** each test case is a single `- [ ]` line with observable title text under a `##` suite heading
- **AND** immediately below that line the case includes **Preconditions** and **Steps** blocks per the schema template

#### Scenario: Co-produced delta specs

- **WHEN** the agent completes a cases phase turn before the halt
- **THEN** the change contains or updates at least one `specs/<capability>/spec.md` delta when the change introduces or modifies testable behavior
- **AND** requirements and scenarios stay aligned with cases in `testcases.md`

#### Scenario: Single halt for cases and specs

- **WHEN** the cases phase ends awaiting user approval
- **THEN** the agent asks exactly one question covering approval of the case list and the specs together
- **AND** the agent does not start publish or Qase MCP in the same message

#### Scenario: analisis.md overrides diff in cases phase

- **WHEN** the agent runs the cases phase and `analisis.md` documents expected behavior or a known defect that differs from the PR diff or current code
- **THEN** the agent reads `analisis.md` in full before fetching the change set
- **AND** test cases and delta specs reflect `analisis.md`, not accidental implementation
- **AND** known defects are tested as corrected behavior, not encoded as accepted SHALL/MUST requirements

#### Scenario: Chat iteration updates both artifacts

- **WHEN** the user requests case or requirement changes after the initial cases draft
- **THEN** the agent updates `testcases.md` and affected `specs/**/*.md` in the same conversation without requiring a separate slash command

#### Scenario: Cases iteration updates analysis when behavior agreement changes

- **WHEN** the user clarifies defect vs expected behavior or other agreed facts after the cases draft
- **THEN** the agent updates `analisis.md` (especially **Validated clarifications**) before updating `testcases.md` and affected `specs/**/*.md`

#### Scenario: No invented vague steps

- **WHEN** the agent drafts case steps
- **THEN** each action and expected result uses concrete UI labels, URLs, data, or API behavior found in sources read for this change
- **AND** generic placeholder steps are used only when sources lack actionable detail
- **AND** the agent self-audits before halt that no step is untraceable to a source unless marked as a documented gap

#### Scenario: Dual analysts when cases flag true

- **WHEN** `workflow.multipleSubagents.cases` is **true** and the Task tool is available
- **THEN** the agent runs two parallel blind Task subagents before merging drafts into `testcases.md` and delta specs

#### Scenario: Orchestrator-only when cases flag false

- **WHEN** `workflow.multipleSubagents.cases` is **false** or omitted (default)
- **THEN** the orchestrator drafts cases and specs without Task subagents
- **AND** the workflow does not delegate to a single subagent as a substitute

### Requirement: Workflow skills document multipleSubagents config

Generated `qaspec-analyze` and `qaspec-cases` skills SHALL instruct agents to read `workflow.multipleSubagents.review` and `workflow.multipleSubagents.cases` from `qaspec/config.yaml` before choosing dual Task delegations versus orchestrator-only execution.

#### Scenario: Skill body mentions config keys

- **WHEN** `qaspec update` regenerates analyze and cases skills
- **THEN** each skill body references `workflow.multipleSubagents` with review and cases keys
- **AND** the skill states orchestrator-only behavior when the flag for that phase is false

### Requirement: Publish workflow behavior

The `qaspec-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, read completed `specs/**/*.md` for context before MCP when files exist, resolve Qase prerequisites from existing artifacts or one halt question, write or update `execution-context.md` and `publish-plan.md` for user review using preconditions and steps from each case block in `testcases.md` (or legacy `testmatrix.md` when only that file exists), halt once for the user to edit those files or confirm publish, and only after explicit confirmation validate the case list, call Qase via MCP when configured, write `publish-log.md`, and mark published rows in the tracked cases file.

#### Scenario: Prerequisites before MCP

- **WHEN** required Qase fields are missing from artifacts and chat context
- **THEN** the agent stops with one question listing only missing fields
- **AND** does not invoke Qase MCP until fields are provided

#### Scenario: Publish blocked without specs

- **WHEN** `testcases.md` exists but no files exist under the change `specs/` directory and the schema apply phase requires `specs`
- **THEN** the agent does not invoke Qase MCP
- **AND** the agent directs the user to complete `/qsx:cases` (or author deltas) before publish

#### Scenario: Prepare files before TCMS upload

- **WHEN** Qase prerequisites are known or collected and the case list is approved
- **THEN** the agent writes or updates `execution-context.md` with project code, role, and base URL
- **AND** the agent writes `publish-plan.md` from unchecked cases in `testcases.md`, including each case's **Preconditions** and **Steps** when present
- **AND** the agent does not invoke Qase MCP in the same message

#### Scenario: Single halt before publish

- **WHEN** `execution-context.md` and `publish-plan.md` are ready for review
- **THEN** the agent asks exactly one question for the user to edit those files or confirm publish
- **AND** the agent does not call Qase MCP until the user confirms

#### Scenario: MCP only after confirmation

- **WHEN** the user confirms publish after the prepare-and-halt step
- **THEN** the agent re-reads `execution-context.md`, `publish-plan.md`, and `testcases.md`
- **AND** the agent maps case **Preconditions** and **Steps** to Qase fields per `qase_test_case_rules.md` without replacing steps with newly invented steps based only on titles
- **AND** the agent invokes Qase MCP, writes `publish-log.md`, and marks each published row `- [x]` in `testcases.md`

#### Scenario: User edits plan before confirm

- **WHEN** the user requests changes to Qase targets or case scope after the publish halt
- **THEN** the agent updates `execution-context.md` and/or `publish-plan.md` in chat
- **AND** asks again for confirm before MCP

#### Scenario: Publish from legacy in-flight change

- **GIVEN** a change created before the rename contains `testmatrix.md` and no `testcases.md`
- **WHEN** the user runs `/qsx:publish`
- **THEN** publish reads and tracks `testmatrix.md` as the case source
- **AND** a notice suggests renaming the file to `testcases.md`

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

### Requirement: Retired workflow ids are ignored at resolution

When a global or project profile lists a retired QASpec workflow id (such as `explore`), workflow resolution SHALL skip it with a short notice pointing to `/qsx:analyze`, and generation SHALL continue for the remaining workflows without error.

#### Scenario: Custom profile still lists explore

- **GIVEN** global config has `profile: custom` with workflows `explore`, `analyze`, `cases`
- **WHEN** the user runs `qaspec init` or `qaspec update`
- **THEN** skills and commands are generated for `analyze` and `cases`
- **AND** a notice explains that `explore` was retired and investigation now starts with `/qsx:analyze`
- **AND** the command exits successfully

## ADDED Requirements

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
