## MODIFIED Requirements

### Requirement: Legacy artifact detection

The system SHALL detect legacy artifacts from previous QASpec init versions only. When upstream OpenSpec is not active, the system SHALL treat QASpec-installed `openspec-*` skills and `opsx-*` / pre-skill `openspec-*` command files as removable legacy targets using the explicit legacy registry. When upstream OpenSpec is active, the system SHALL NOT classify upstream `opsx-*` commands or active `openspec/` planning files as legacy.

#### Scenario: Detecting legacy slash command directories

- **WHEN** running `qaspec init` on an existing project
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL check for old slash command directories and files using the legacy registry
- **AND** SHALL include `qas-*` and `openspec-*` / `opsx-*` patterns that QASpec previously generated
- **WHEN** upstream OpenSpec is active
- **THEN** `opsx-*` and upstream `openspec-*` skills SHALL NOT be legacy targets

#### Scenario: Detecting legacy structure files

- **WHEN** running `qaspec init` on an existing project
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL check for `openspec/AGENTS.md` and root `AGENTS.md` with marker blocks as defined in the legacy registry
- **WHEN** upstream OpenSpec is active
- **THEN** the system SHALL NOT flag `openspec/AGENTS.md` or `openspec/project.md` as legacy artifacts

### Requirement: Legacy cleanup confirmation

The system SHALL prompt for confirmation before removing QASpec legacy artifacts. The system SHALL NOT prompt when upstream OpenSpec is active and no QASpec legacy artifacts exist.

#### Scenario: Prompting for cleanup when legacy detected

- **WHEN** QASpec legacy artifacts are detected (including previously generated `openspec-*` skills)
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL display what was found
- **AND** prompt with QASpec-branded copy
- **AND** default to Yes if user presses Enter

#### Scenario: User confirms cleanup

- **WHEN** user responds Y or presses Enter
- **THEN** the system SHALL remove only artifacts identified in detection
- **AND** proceed with QASpec-only skill and command setup
