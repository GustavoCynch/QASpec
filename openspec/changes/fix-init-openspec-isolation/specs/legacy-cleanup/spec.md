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
- **AND** SHALL include `qas-*` and pre-skill `openspec-*` patterns
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

### Requirement: Legacy cleanup confirmation

The system SHALL prompt for confirmation before removing QASpec legacy artifacts. The system SHALL NOT prompt when upstream OpenSpec is active and no QASpec legacy artifacts exist.

#### Scenario: Prompting for cleanup when legacy detected

- **WHEN** QASpec legacy artifacts are detected
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL display what was found
- **AND** prompt with QASpec-branded copy (not “Upgrading to the new OpenSpec”)
- **AND** default to Yes if user presses Enter

#### Scenario: User confirms cleanup

- **WHEN** user responds Y or presses Enter
- **THEN** the system SHALL remove only QASpec legacy artifacts identified in detection
- **AND** proceed with skill-based QASpec setup

#### Scenario: User declines cleanup

- **WHEN** user responds N
- **THEN** the system SHALL abort initialization
- **AND** display message suggesting manual cleanup or using `--force` flag

#### Scenario: Non-interactive mode

- **WHEN** running with `--no-interactive` or in CI environment
- **AND** QASpec legacy artifacts are detected
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL auto-clean QASpec legacy artifacts (existing behavior for QASpec-owned legacy only)

#### Scenario: Skip prompt when upstream OpenSpec is active

- **WHEN** upstream OpenSpec is active
- **THEN** the system SHALL NOT display legacy cleanup confirmation
- **AND** SHALL NOT remove upstream OpenSpec files

### Requirement: Legacy directory removal

The system SHALL remove legacy slash command directories and files that belong to QASpec migration only.

#### Scenario: Removing old slash command directory

- **WHEN** a legacy slash command directory exists from the QASpec legacy registry (e.g. `.claude/commands/openspec/`)
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL delete the entire directory and its contents
- **AND** NOT delete the parent directory (e.g. `.claude/commands/` remains)

#### Scenario: Not removing opsx command files

- **WHEN** `opsx-*` command files exist for upstream OpenSpec
- **THEN** the system SHALL NOT delete those files during `qaspec init` or `qaspec update`

#### Scenario: Removing legacy AGENTS.md

- **WHEN** `openspec/AGENTS.md` exists
- **AND** upstream OpenSpec is not active
- **AND** the file is classified as legacy by detection
- **THEN** the system SHALL delete the file
- **AND** NOT delete the `openspec/` directory itself
