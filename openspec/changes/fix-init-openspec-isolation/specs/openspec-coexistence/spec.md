## ADDED Requirements

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

When upstream OpenSpec is active, the QASpec CLI SHALL NOT delete, move, or prompt to clean up upstream OpenSpec artifacts.

#### Scenario: Init with coexisting OpenSpec

- **WHEN** a user runs `qaspec init` interactively
- **AND** upstream OpenSpec is active
- **THEN** the system SHALL NOT display legacy cleanup or “upgrade OpenSpec” prompts
- **AND** the system SHALL NOT remove `opsx-*` command files
- **AND** the system SHALL NOT remove `openspec/AGENTS.md`
- **AND** the system SHALL proceed to set up `qaspec/` and QASpec skills/commands

#### Scenario: Update with coexisting OpenSpec

- **WHEN** a user runs `qaspec update`
- **AND** upstream OpenSpec is active
- **THEN** the system SHALL apply the same non-interference rules as init

#### Scenario: QASpec setup completes alongside OpenSpec

- **WHEN** `qaspec init` completes on a project with active upstream OpenSpec
- **THEN** the user SHALL still have a working OpenSpec install (unchanged opsx commands and `openspec/` files)
- **AND** the user SHALL have a `qaspec/` planning home and QASpec tooling installed
