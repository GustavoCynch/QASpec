## MODIFIED Requirements

### Requirement: Do not modify upstream OpenSpec when active

When upstream OpenSpec is active, the QASpec CLI SHALL NOT delete, move, prompt to clean up, or **overwrite** upstream OpenSpec artifacts. QASpec SHALL install and update only `qas-*` skills and `/qas:*` (or `qas-` prefixed) commands.

#### Scenario: Init with coexisting OpenSpec

- **WHEN** a user runs `qaspec init` interactively
- **AND** upstream OpenSpec is active
- **THEN** the system SHALL NOT display legacy cleanup or “upgrade OpenSpec” prompts
- **AND** the system SHALL NOT remove upstream `opsx-*` command files
- **AND** the system SHALL NOT remove `openspec/AGENTS.md`
- **AND** the system SHALL NOT overwrite existing upstream `openspec-*` skill `SKILL.md` files
- **AND** the system SHALL NOT overwrite existing upstream `opsx-*` command files
- **AND** the system SHALL proceed to set up `qaspec/` and QASpec `qas-*` skills/commands only

#### Scenario: Update with coexisting OpenSpec

- **WHEN** a user runs `qaspec update`
- **AND** upstream OpenSpec is active
- **THEN** the system SHALL apply the same non-interference rules as init
- **AND** profile or delivery changes SHALL NOT remove or rewrite upstream `openspec-*` skills or `opsx-*` commands

#### Scenario: QASpec setup completes alongside OpenSpec

- **WHEN** `qaspec init` completes on a project with active upstream OpenSpec
- **THEN** the user SHALL still have a working upstream OpenSpec install (unchanged upstream artifacts)
- **AND** the user SHALL have a `qaspec/` planning home and QASpec `qas-*` tooling installed

#### Scenario: QASpec does not refresh upstream propose skill

- **GIVEN** `.cursor/skills/openspec-propose/SKILL.md` exists before init from upstream OpenSpec
- **AND** upstream OpenSpec is active
- **WHEN** the user runs `qaspec init` with Cursor selected
- **THEN** the upstream `openspec-propose` skill file SHALL retain its pre-init content
- **AND** QASpec `qas-*` skills for the core profile SHALL still be created or updated

### Requirement: Coexistence summary when skipping upstream writes

When upstream OpenSpec is active and QASpec skips writing upstream paths, the CLI SHALL emit a brief summary that upstream artifacts were left unchanged and QASpec artifacts were installed.

#### Scenario: Init logs coexistence skip

- **WHEN** `qaspec init` detects active upstream OpenSpec
- **THEN** output includes a line stating upstream OpenSpec skills and `opsx-*` commands were left unchanged
- **AND** the message names **upstream OpenSpec** and **QASpec** distinctly
