## ADDED Requirements

### Requirement: QASpec command id prefix

When generating commands for QASpec workflows, adapters SHALL use the `qas-` file prefix and `/qas:` slash name prefix instead of `opsx-` and `/opsx:`.

#### Scenario: Cursor QASpec command path

- **WHEN** generating the `analyze` command for Cursor with QASpec templates
- **THEN** `getFilePath('analyze')` resolves to `.cursor/commands/qas-analyze.md` using path.join
- **AND** formatted frontmatter `name` is `/qas:analyze`

#### Scenario: Hyphen transform tools

- **WHEN** generating commands for OpenCode or Pi with hyphen command syntax
- **THEN** `transformToHyphenCommands` converts `/qas:` to `/qas-` in instruction bodies

### Requirement: QASpec command content registry

The skill generation registry SHALL map workflow ids `explore`, `analyze`, `matrix`, `publish`, and `archive` to QASpec template getters.

#### Scenario: Filtered generation

- **WHEN** init requests workflows `['analyze', 'matrix']` only
- **THEN** only matching QASpec command and skill templates are emitted

## MODIFIED Requirements

### Requirement: CommandContent interface

The system SHALL define a tool-agnostic `CommandContent` interface for command data.

#### Scenario: CommandContent structure

- **WHEN** defining a command to generate
- **THEN** `CommandContent` SHALL include:
  - `id`: string identifier (e.g., 'explore', 'analyze', 'matrix', 'publish')
  - `name`: human-readable name (e.g., 'QASpec Analyze')
  - `description`: brief description of command purpose
  - `category`: grouping category (e.g., 'QASpec')
  - `tags`: array of tag strings
  - `body`: the command instruction content

### Requirement: ToolCommandAdapter interface

The system SHALL define a `ToolCommandAdapter` interface for per-tool formatting.

#### Scenario: Adapter interface structure

- **WHEN** implementing a tool adapter
- **THEN** `ToolCommandAdapter` SHALL require:
  - `toolId`: string identifier matching `AIToolOption.value`
  - `getFilePath(commandId: string)`: returns file path for command (relative from project root, or absolute for global-scoped tools like Codex)
  - `formatFile(content: CommandContent)`: returns complete file content with frontmatter

#### Scenario: Claude adapter formatting

- **WHEN** formatting a command for Claude Code
- **THEN** the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
- **AND** file path SHALL follow pattern `.claude/commands/qas/<id>.md` for QASpec workflows

#### Scenario: Cursor adapter formatting

- **WHEN** formatting a command for Cursor with QASpec workflows
- **THEN** the adapter SHALL output YAML frontmatter with `name` as `/qas:<id>`, `id` as `qas-<id>`, `category`, `description` fields
- **AND** file path SHALL follow pattern `.cursor/commands/qas-<id>.md`

#### Scenario: Windsurf adapter formatting

- **WHEN** formatting a command for Windsurf with QASpec workflows
- **THEN** the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
- **AND** file path SHALL follow pattern `.windsurf/workflows/qas-<id>.md`
