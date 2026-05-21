## MODIFIED Requirements

### Requirement: Content migration from qa-pr-review

Workflow template bodies SHALL be derived from `.agents/skills/qa-pr-review/SKILL.md` phases (1→analyze, 2→matrix, 3+4→publish). The pack MAY remain in the repository as a **reference-only** archive; it SHALL NOT be installed or advertised as the active QA workflow. Runtime QA behavior SHALL be available only via `qas-*` skills and `/qas:*` commands from init (core profile), with project reference seeds under `qaspec/references/`.

#### Scenario: Reference pack retained in fork

- **WHEN** a contributor clones the QASpec fork
- **THEN** path `.agents/skills/qa-pr-review/` MAY exist with SKILL.md and `references/`
- **AND** SKILL.md or README states the pack is reference-only and superseded by `/qas:analyze`, `/qas:matrix`, `/qas:publish`
- **AND** the skill is not auto-invoked as a product workflow (e.g. `disable-model-invocation: true` or equivalent)

#### Scenario: No duplicate QA pack in core init

- **WHEN** init completes on a fresh repo with the QASpec core profile
- **THEN** core init does not install `qa-pr-review` as a managed workflow skill
- **AND** QASpec QA behavior is available via `qas-*` only
- **AND** init scaffolds `qaspec/references/` from bundled seeds, not by copying `.agents/skills/qa-pr-review/references/`

#### Scenario: Fork dogfooding uses spec-driven agent commands

- **WHEN** maintainers work on the CLI in this repository
- **THEN** they MAY use committed `opsx-*` / `openspec-*` commands under `.cursor/` for `spec-driven` changes
- **AND** absence of committed `qas-*.md` under `.cursor/` does not indicate a product defect

## ADDED Requirements

### Requirement: Consumer install validation path

Maintainers SHALL validate QASpec agent output by running init in a temporary project directory, not by requiring `qas-*` command files in the fork’s `.cursor/` tree.

#### Scenario: Temp dir smoke after workflow changes

- **WHEN** a change touches QASpec workflow templates or command adapters
- **THEN** verification includes `openspec init` in a temp directory
- **AND** the temp directory contains `.cursor/commands/qas-analyze.md` (or tool-equivalent) when Cursor is selected
- **AND** the fork repository is not required to commit those generated files
