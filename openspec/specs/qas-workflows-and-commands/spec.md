# qas-workflows-and-commands Specification

## Purpose

Replace the default OpenSpec **core** agent surface with QASpec QA commands and skills for end users of the fork.
## Requirements
### Requirement: Upstream OpenSpec workflow artifacts are not replaced

When upstream OpenSpec is active in a project, QASpec init and update SHALL install only the QASpec core (`qaspec-*` skills and `qsx-*` commands) workflow surface and SHALL leave upstream `openspec-*` skills and `opsx-*` commands unchanged.

#### Scenario: Core profile beside upstream OpenSpec

- **GIVEN** upstream OpenSpec is active with `openspec-propose` and `openspec-apply-change` skills already installed
- **WHEN** the user runs `qaspec init` with the QASpec core profile
- **THEN** `qaspec-explore`, `qaspec-analyze`, `qaspec-matrix`, `qaspec-publish`, and `qaspec-archive` skills are created or updated
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
- **THEN** global config becomes `profile: core` with workflows `explore`, `analyze`, `matrix`, `publish`, `archive`
- **AND** `qaspec-publish` skill and `/qsx:publish` command are generated when delivery includes skills and/or commands

### Requirement: Core workflow set

The QASpec product core profile SHALL install exactly these workflow ids: `explore`, `analyze`, `matrix`, `publish`, `archive`. Users whose global config was auto-migrated from the legacy OpenSpec core set SHALL receive this set on the next init or update without manual `qaspec config profile` steps.

#### Scenario: Init with core profile

- **WHEN** a user runs init with the QASpec core profile (including after legacy global-config migration)
- **THEN** skills are generated for all five workflow ids including `publish`
- **AND** workflows `propose`, `apply`, `sync`, `ff`, `verify`, and `onboard` are not installed unless the user selects a custom/full profile that explicitly includes them

#### Scenario: Publish artifacts present after migration

- **WHEN** init or update runs after legacy profile migration
- **THEN** `.cursor/skills/qaspec-publish/SKILL.md` exists when skills delivery is enabled
- **AND** a publish command file exists under the tool commands directory (e.g. `.cursor/commands/qsx-publish.md`)

### Requirement: Skill directory naming

Each installed skill SHALL use the `qaspec-<workflow>` directory name under the tool skills folder.

#### Scenario: Cursor skills layout

- **WHEN** init configures Cursor with skills delivery
- **THEN** files exist at `.cursor/skills/qaspec-analyze/SKILL.md` (and siblings for explore, matrix, publish, archive)
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
- **THEN** `/qsx:analyze` produces `analisis.md` in Spanish
- **AND** the skill source file under `src/core/templates/workflows/` is still maintained in English

### Requirement: Analyze workflow behavior

The `qaspec-analyze` skill and `/qsx:analyze` command SHALL produce `analisis.md`, require reading `qaspec/references/historical_bugs.md`, use dual blind analyst synthesis by default, include an **Affected capabilities** section in `analisis.md` using kebab-case names, SHALL NOT write `specs/**/*.md` in the analyze step, and end with exactly one halt question before matrix work in the same turn.

#### Scenario: Analyze references path

- **WHEN** the agent runs analyze for a project initialized by QASpec
- **THEN** instructions point to `qaspec/references/historical_bugs.md` using path.join-safe resolution from project root

#### Scenario: Analyze does not write specs

- **WHEN** analyze completes with a halt
- **THEN** `analisis.md` exists
- **AND** no new `specs/<capability>/spec.md` files are required from the analyze step alone

### Requirement: Matrix workflow behavior

The `qaspec-matrix` skill and `/qsx:matrix` command SHALL produce `testmatrix.md` with mandatory checkboxes, create or update change delta specs under `specs/**/*.md` in the same phase, read `qaspec/references/qase_test_case_rules.md`, read `openspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md` when present, and halt once for human approval of **both** the case list and the requirements.

#### Scenario: Matrix format

- **WHEN** matrix output is written
- **THEN** each test case is a single `- [ ]` line with observable title text under a `##` suite heading

#### Scenario: Co-produced delta specs

- **WHEN** the agent completes a matrix phase turn before the halt
- **THEN** the change contains or updates at least one `specs/<capability>/spec.md` delta when the change introduces or modifies testable behavior
- **AND** requirements and scenarios stay aligned with cases in `testmatrix.md`

#### Scenario: Single halt for matrix and specs

- **WHEN** the matrix phase ends awaiting user approval
- **THEN** the agent asks exactly one question covering approval of the matrix and the specs together
- **AND** the agent does not start publish or Qase MCP in the same message

#### Scenario: Chat iteration updates both artifacts

- **WHEN** the user requests case or requirement changes after the initial matrix draft
- **THEN** the agent updates `testmatrix.md` and affected `specs/**/*.md` in the same conversation without requiring a separate slash command

### Requirement: Publish workflow behavior

The `qaspec-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, read completed `specs/**/*.md` for context before MCP when files exist, resolve Qase prerequisites from existing artifacts or one halt question, validate the matrix, call Qase via MCP when configured, write `publish-log.md`, and mark published rows in `testmatrix.md`.

#### Scenario: Prerequisites before MCP

- **WHEN** required Qase fields are missing from artifacts and chat context
- **THEN** the agent stops with one question listing only missing fields
- **AND** does not invoke Qase MCP until fields are provided

#### Scenario: Publish blocked without specs

- **WHEN** `testmatrix.md` exists but no files exist under the change `specs/` directory and the schema apply phase requires `specs`
- **THEN** the agent does not invoke Qase MCP
- **AND** the agent directs the user to complete `/qsx:matrix` (or author deltas) before publish

### Requirement: Explore workflow guardrails

The `qaspec-explore` skill SHALL allow investigation without requiring `analisis.md` or `testmatrix.md`, and SHALL NOT skip halts for analyze, matrix, or publish.

#### Scenario: Explore does not replace analyze

- **WHEN** a user runs `/qsx:explore` then `/qsx:matrix` without analyze
- **THEN** matrix instructions still require prior artifacts per schema unless the user created them manually

### Requirement: Content migration from qa-pr-review

Workflow template bodies SHALL be derived from `.agents/skills/qa-pr-review/SKILL.md` phases (1→analyze, 2→matrix, 3+4→publish). The pack MAY remain in the repository as a **reference-only** archive; it SHALL NOT be installed or advertised as the active QA workflow. Runtime QA behavior SHALL be available only via `qaspec-*` skills and `/qsx:*` commands from init (core profile), with project reference seeds under `qaspec/references/`.

#### Scenario: Reference pack retained in fork

- **WHEN** a contributor clones the QASpec fork
- **THEN** path `.agents/skills/qa-pr-review/` MAY exist with SKILL.md and `references/`
- **AND** SKILL.md or README states the pack is reference-only and superseded by `/qsx:analyze`, `/qsx:matrix`, `/qsx:publish`
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

