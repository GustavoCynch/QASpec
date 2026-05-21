## MODIFIED Requirements

### Requirement: Do not modify upstream OpenSpec when active

When upstream OpenSpec is active, the QASpec CLI SHALL NOT delete, move, prompt to clean up, or **overwrite** upstream OpenSpec artifacts.

#### Scenario: Init with coexisting OpenSpec

- **WHEN** a user runs `qaspec init` interactively
- **AND** upstream OpenSpec is active
- **THEN** the system SHALL NOT display legacy cleanup or “upgrade OpenSpec” prompts
- **AND** the system SHALL NOT remove `opsx-*` command files
- **AND** the system SHALL NOT remove `openspec/AGENTS.md`
- **AND** the system SHALL NOT overwrite existing `openspec-*` skill `SKILL.md` files under configured tool skills paths
- **AND** the system SHALL NOT overwrite existing `opsx-*` command files under configured tool command paths
- **AND** the system SHALL proceed to set up `qaspec/` and QASpec (`qaspec-*` skills, `qsx-*` commands)

#### Scenario: Update with coexisting OpenSpec

- **WHEN** a user runs `qaspec update`
- **AND** upstream OpenSpec is active
- **THEN** the system SHALL apply the same non-interference rules as init
- **AND** profile or delivery changes SHALL NOT remove or rewrite upstream `openspec-*` skills or `opsx-*` commands

#### Scenario: QASpec setup completes alongside OpenSpec

- **WHEN** `qaspec init` completes on a project with active upstream OpenSpec
- **THEN** the user SHALL still have a working OpenSpec install (unchanged opsx commands, `openspec-*` skills, and `openspec/` files)
- **AND** the user SHALL have a `qaspec/` planning home and QASpec tooling installed

#### Scenario: Upstream propose and apply skills preserved

- **GIVEN** `.cursor/skills/openspec-propose/SKILL.md` and `.cursor/skills/openspec-apply-change/SKILL.md` exist before init
- **AND** upstream OpenSpec is active
- **WHEN** the user runs `qaspec init` with Cursor selected and a profile that includes `propose` and `apply` workflows
- **THEN** both skill files SHALL retain their pre-init byte content
- **AND** QASpec `qaspec-*` skills for the selected profile SHALL still be created or updated
