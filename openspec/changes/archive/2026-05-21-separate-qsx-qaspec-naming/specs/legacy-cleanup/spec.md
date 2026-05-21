## MODIFIED Requirements

### Requirement: Legacy artifact detection

The system SHALL detect legacy artifacts from previous QASpec init versions only. The system SHALL NOT classify current upstream OpenSpec artifacts (`opsx-*` commands, active `openspec/` planning files) as legacy when upstream OpenSpec is active.

#### Scenario: Detecting legacy config files

- **WHEN** running `qaspec init` on an existing project
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL check for config files with OpenSpec/QASpec marker blocks in the explicit legacy config file list
- **AND** SHALL NOT treat unmarked config files as legacy

#### Scenario: Detecting legacy slash command directories

- **WHEN** running `qaspec init` on an existing project
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL check for old slash command directories and files using the legacy registry
- **AND** SHALL include transitional `qas-*` skills and `qas-*.md` commands from the bootstrap naming era
- **AND** SHALL include pre-skill `openspec-*` patterns where applicable
- **AND** SHALL NOT include current `qsx-*` or `qaspec-*` as legacy targets
- **AND** SHALL NOT include `opsx-*` patterns as legacy targets

#### Scenario: Detecting legacy structure files

- **WHEN** running `qaspec init` on an existing project
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL check for `openspec/AGENTS.md` and root `AGENTS.md` with marker blocks as defined in the legacy registry
- **WHEN** upstream OpenSpec is active
- **THEN** the system SHALL NOT flag `openspec/AGENTS.md` or `openspec/project.md` as legacy artifacts

#### Scenario: No legacy detected when only upstream OpenSpec is present

- **WHEN** running `qaspec init` on a project with active upstream OpenSpec
- **AND** only upstream OpenSpec artifacts are present (no QASpec legacy)
- **THEN** the system SHALL report no legacy artifacts
- **AND** SHALL proceed directly with QASpec skill setup
