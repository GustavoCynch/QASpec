# qas-workflows-and-commands Specification

## Purpose

Replace the default OpenSpec **core** agent surface with QASpec QA commands and skills for end users of the fork.

## Requirements

### Requirement: Core workflow set

The QASpec product core profile SHALL install exactly these workflow ids: `explore`, `analyze`, `matrix`, `publish`, `archive`.

#### Scenario: Init with core profile

- **WHEN** a user runs init with the QASpec core profile (or default after this change)
- **THEN** skills are generated only for the five workflow ids above
- **AND** workflows `propose`, `apply`, `sync`, `ff`, `verify`, and `onboard` are not installed unless the user selects a custom/full profile

### Requirement: Skill directory naming

Each installed skill SHALL use the `qas-<workflow>` directory name under the tool skills folder.

#### Scenario: Cursor skills layout

- **WHEN** init configures Cursor with skills delivery
- **THEN** files exist at `.cursor/skills/qas-analyze/SKILL.md` (and siblings for explore, matrix, publish, archive)
- **AND** skill frontmatter `name` matches the directory (e.g. `qas-analyze`)

### Requirement: Slash command naming

Generated agent commands SHALL expose `/qas:<workflow>` (colon form) for tools that use colon slash commands.

#### Scenario: Cursor command files

- **WHEN** init configures Cursor with commands delivery
- **THEN** command files are named `qas-<workflow>.md` under `.cursor/commands/`
- **AND** frontmatter `name` is `/qas:<workflow>` (e.g. `/qas:analyze`)

### Requirement: Project language for workflow output

QASpec workflow skills SHALL instruct agents to use the language from `openspec/config.yaml` `context` and per-artifact `rules` for all user-facing artifact text and halt messages. Skill bodies in `src/` remain English.

#### Scenario: Spanish QA project

- **WHEN** project config declares Spanish in `context`
- **THEN** `/qas:analyze` produces `analisis.md` in Spanish
- **AND** the skill source file under `src/core/templates/workflows/` is still maintained in English

### Requirement: Analyze workflow behavior

The `qas-analyze` skill and `/qas:analyze` command SHALL produce `analisis.md`, require reading `qaspec/references/historical_bugs.md`, use dual blind analyst synthesis by default, and end with exactly one halt question before matrix work in the same turn.

#### Scenario: Analyze references path

- **WHEN** the agent runs analyze for a project initialized by QASpec
- **THEN** instructions point to `qaspec/references/historical_bugs.md` using path.join-safe resolution from project root

### Requirement: Matrix workflow behavior

The `qas-matrix` skill SHALL produce `testmatrix.md` with mandatory checkboxes, read `qaspec/references/qase_test_case_rules.md`, and halt for human approval of the case list.

#### Scenario: Matrix format

- **WHEN** matrix output is written
- **THEN** each test case is a single `- [ ]` line with observable title text under a `##` suite heading

### Requirement: Publish workflow behavior

The `qas-publish` skill SHALL resolve Qase prerequisites from existing artifacts or one halt question, validate the matrix, call Qase via MCP when configured, write `publish-log.md`, and mark published rows in `testmatrix.md`.

#### Scenario: Prerequisites before MCP

- **WHEN** required Qase fields are missing from artifacts and chat context
- **THEN** the agent stops with one question listing only missing fields
- **AND** does not invoke Qase MCP until fields are provided

### Requirement: Explore workflow guardrails

The `qas-explore` skill SHALL allow investigation without requiring `analisis.md` or `testmatrix.md`, and SHALL NOT skip halts for analyze, matrix, or publish.

#### Scenario: Explore does not replace analyze

- **WHEN** a user runs `/qas:explore` then `/qas:matrix` without analyze
- **THEN** matrix instructions still require prior artifacts per schema unless the user created them manually

### Requirement: Content migration from qa-pr-review

Workflow template bodies SHALL be derived from `.agents/skills/qa-pr-review/SKILL.md` phases (1→analyze, 2→matrix, 3+4→publish) without retaining a parallel `qa-pr-review` install in core init.

#### Scenario: No duplicate QA pack in core init

- **WHEN** init completes on a fresh repo
- **THEN** core init does not install `qa-pr-review` as a managed workflow skill
- **AND** QASpec QA behavior is available via `qas-*` only
