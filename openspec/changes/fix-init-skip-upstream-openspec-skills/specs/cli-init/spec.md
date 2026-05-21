## MODIFIED Requirements

### Requirement: Skill Generation

The command SHALL generate Agent Skills for selected AI tools. When upstream OpenSpec is active in the target project, the command SHALL generate only `qas-*` skills and SHALL skip all `openspec-*` skill directories.

#### Scenario: Generating skills for a tool

- **WHEN** a tool is selected during initialization
- **AND** upstream OpenSpec is not active
- **THEN** create skill directories under `.<tool>/skills/` for each workflow in the active profile (including `openspec-*` dirs when those workflows are selected)
- **AND** each SKILL.md SHALL contain YAML frontmatter with name and description
- **AND** each SKILL.md SHALL contain the skill instructions

#### Scenario: Generating skills with upstream OpenSpec present

- **WHEN** a tool is selected during initialization
- **AND** upstream OpenSpec is active
- **THEN** create or update only `qas-*` skill directories for workflows in the active profile
- **AND** SHALL NOT write to any `openspec-*` skill path that exists or would be managed by upstream OpenSpec

### Requirement: Slash Command Generation

The command SHALL generate opsx slash commands only for selected tools that have a registered command adapter, while keeping adapterless tools valid for skill generation. When upstream OpenSpec is active, the command SHALL NOT write `opsx-*` command files.

#### Scenario: Generating slash commands for a tool with a registered adapter

- **WHEN** a tool with a registered command adapter is selected during initialization
- **AND** upstream OpenSpec is not active
- **THEN** create slash command files for workflows in the active profile using the tool's command adapter
- **AND** use tool-specific path conventions (e.g., `.claude/commands/opsx/` for Claude)
- **AND** include tool-specific frontmatter format

#### Scenario: Generating slash commands with upstream OpenSpec present

- **WHEN** a tool with a registered command adapter is selected during initialization
- **AND** upstream OpenSpec is active
- **THEN** create or update only `qas-*` command files for QASpec workflows in the active profile
- **AND** SHALL NOT overwrite existing `opsx-*` command files

#### Scenario: Selected tool has no command adapter

- **GIVEN** a selected tool has `skillsDir` configured but no registered command adapter
- **WHEN** initialization includes command generation
- **THEN** skill generation for that tool SHALL still remain valid
- **AND** command-file generation SHALL be skipped for that tool
- **AND** the command output SHALL include `Commands skipped for: <tool-id> (no adapter)`

#### Scenario: Kimi CLI skips command-file generation

- **WHEN** the user selects Kimi CLI during initialization
- **THEN** OpenSpec SHALL treat it as a supported tool with `skillsDir: '.kimi'`
- **AND** command-file generation SHALL be skipped because no Kimi adapter is registered
