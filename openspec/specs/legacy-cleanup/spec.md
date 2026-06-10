# legacy-cleanup Specification

## Purpose
Define detection and cleanup behavior for legacy QASpec artifacts during `qaspec init` and `qaspec update` workflows, without interfering with an active upstream OpenSpec installation.
## Requirements
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

- **WHEN** running in CI or non-interactive mode
- **AND** QASpec legacy artifacts are detected
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL auto-clean QASpec legacy artifacts

#### Scenario: Skip prompt when upstream OpenSpec is active

- **WHEN** upstream OpenSpec is active
- **THEN** the system SHALL NOT display legacy cleanup confirmation
- **AND** SHALL NOT remove upstream OpenSpec files

### Requirement: Surgical removal of config file content

The system SHALL preserve user content when removing OpenSpec markers from config files.

#### Scenario: Config file with only OpenSpec content

- **WHEN** a config file contains only OpenSpec marker block (whitespace outside is acceptable)
- **THEN** the system SHALL remove the OpenSpec marker block
- **AND** preserve the file (even if empty or whitespace-only)
- **AND** NOT delete the file (config files belong to the user's project root)

#### Scenario: Config file with mixed content

- **WHEN** a config file contains content outside OpenSpec markers
- **THEN** the system SHALL remove only the `<!-- OPENSPEC:START -->` to `<!-- OPENSPEC:END -->` block
- **AND** preserve all content before and after the markers
- **AND** clean up any resulting double blank lines

#### Scenario: Root AGENTS.md with mixed content

- **WHEN** root `AGENTS.md` contains OpenSpec markers AND other content
- **THEN** the system SHALL remove only the OpenSpec marker block
- **AND** preserve the rest of the file

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

### Requirement: project.md migration hint

The system SHALL preserve project.md and display a migration hint instead of deleting it.

#### Scenario: project.md exists during upgrade

- **WHEN** `openspec/project.md` exists during legacy cleanup
- **AND** upstream OpenSpec is not active
- **THEN** the system SHALL NOT delete the file
- **AND** the system SHALL display a migration hint in the output:
  ```
  Manual migration needed:
    → openspec/project.md still exists
      Move useful content to config.yaml's "context:" field, then delete
  ```

#### Scenario: project.md migration rationale

- **GIVEN** project.md may contain user-written project documentation
- **AND** config.yaml's context field serves the same purpose (auto-injected into artifacts)
- **WHEN** displaying the migration hint
- **THEN** users can migrate manually or use `/qsx:analyze` to get AI assistance

### Requirement: Cleanup reporting

The system SHALL report what was cleaned up.

#### Scenario: Displaying cleanup summary

- **WHEN** legacy cleanup completes
- **THEN** the system SHALL display a summary section:
  ```
  Cleaned up legacy files:
    ✓ Removed OpenSpec markers from CLAUDE.md
    ✓ Removed .claude/commands/openspec/ (replaced by /qas:*)
    ✓ Removed openspec/AGENTS.md (no longer needed)
  ```
- **AND IF** `openspec/project.md` exists
- **THEN** the system SHALL display a separate migration section:
  ```
  Manual migration needed:
    → openspec/project.md still exists
      Move useful content to config.yaml's "context:" field, then delete
  ```

#### Scenario: No legacy detected

- **WHEN** no legacy artifacts are found
- **THEN** the system SHALL NOT display the cleanup section
- **AND** proceed directly with skill setup

### Requirement: User-visible cleanup messaging

Legacy cleanup SHALL distinguish **QASpec** artifacts from **upstream OpenSpec** in messages shown to users.

#### Scenario: Reporting upstream coexistence

- **WHEN** cleanup or init detects an active upstream OpenSpec install
- **THEN** user-facing text SHALL say **upstream OpenSpec** (not imply QASpec is OpenSpec)

#### Scenario: Reporting QASpec legacy artifacts

- **WHEN** cleanup removes QASpec-managed legacy paths
- **THEN** messages SHALL refer to **QASpec** or **legacy QASpec** artifacts, not "OpenSpec" alone as this product's name

