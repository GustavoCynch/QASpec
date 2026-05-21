# openspec-coexistence Specification

## Purpose
Ensure QASpec init and update workflows detect an active upstream OpenSpec installation and do not modify or remove its artifacts.
## Requirements
### Requirement: Detect active upstream OpenSpec

The QASpec CLI SHALL detect when a repository already has an active upstream OpenSpec installation before running legacy cleanup.

#### Scenario: OpenSpec planning home with config

- **WHEN** `qaspec init` or `qaspec update` runs on a project
- **AND** the `openspec/` directory exists
- **AND** `openspec/config.yaml` or `openspec/config.yml` exists
- **THEN** the system SHALL treat upstream OpenSpec as active

#### Scenario: OpenSpec opsx slash commands present

- **WHEN** `qaspec init` or `qaspec update` runs on a project
- **AND** at least one `opsx-*` command file exists under a tool commands path that QASpec did not generate with the `qas` prefix (e.g. `.cursor/commands/opsx-apply.md`)
- **THEN** the system SHALL treat upstream OpenSpec as active

#### Scenario: OpenSpec agent skills present

- **WHEN** `qaspec init` or `qaspec update` runs on a project
- **AND** at least one `openspec-*` skill directory exists under a configured tool skills path (e.g. `.cursor/skills/openspec-propose/SKILL.md`)
- **THEN** the system SHALL treat upstream OpenSpec as active

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
- **AND** the system SHALL proceed to set up `qaspec/` and QASpec (`qas-*`) skills/commands

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
- **AND** QASpec `qas-*` skills for the selected profile SHALL still be created or updated

### Requirement: Coexistence summary when skipping upstream writes

When upstream OpenSpec is active and skill or command generation skips upstream artifacts, the CLI SHALL emit a brief, QASpec-branded summary line.

#### Scenario: Init logs coexistence skip

- **WHEN** `qaspec init` skips writing upstream `openspec-*` skills because upstream OpenSpec is active
- **THEN** output includes a line stating upstream OpenSpec skills and `opsx-*` commands were left unchanged
- **AND** the message names **upstream OpenSpec** and **QASpec** distinctly

### Requirement: Coexistence prose clarity

Requirements and user-visible messages about coexistence SHALL name **upstream OpenSpec** and **QASpec** distinctly.

#### Scenario: Init blocked by upstream

- **WHEN** init refuses to modify a repo with active upstream OpenSpec
- **THEN** the message SHALL state that **upstream OpenSpec** is installed and QASpec will not overwrite it

