## MODIFIED Requirements

### Requirement: ToolCommandAdapter interface

The system SHALL define a `ToolCommandAdapter` interface for per-tool formatting.

#### Scenario: Adapter interface structure

- **WHEN** implementing a tool adapter
- **THEN** `ToolCommandAdapter` SHALL require:
  - `toolId`: string identifier matching `AIToolOption.value`
  - `getFilePath(commandId: string)`: returns file path for command (relative from project root, or absolute for global-scoped tools like Codex)
  - `formatFile(content: CommandContent)`: returns complete file content with frontmatter

#### Scenario: Claude adapter formatting for QASpec workflows

- **WHEN** formatting a QASpec command for Claude Code
- **THEN** the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
- **AND** file path SHALL follow pattern `.claude/commands/qsx/<id>.md`

#### Scenario: Claude adapter formatting for legacy workflows

- **WHEN** formatting a legacy OpenSpec command for Claude Code
- **THEN** file path SHALL follow pattern `.claude/commands/opsx/<id>.md`

#### Scenario: Cursor adapter formatting for QASpec workflows

- **WHEN** formatting a QASpec command for Cursor
- **THEN** the adapter SHALL output YAML frontmatter with `name` as `/qsx:<id>`, `id` as `qsx-<id>`, `category`, `description` fields
- **AND** file path SHALL follow pattern `.cursor/commands/qsx-<id>.md`

#### Scenario: Cursor adapter formatting for legacy workflows

- **WHEN** formatting a legacy OpenSpec command for Cursor
- **THEN** frontmatter `name` SHALL use `/opsx:<id>` form
- **AND** file path SHALL follow pattern `.cursor/commands/opsx-<id>.md`

#### Scenario: Windsurf adapter formatting for QASpec workflows

- **WHEN** formatting a QASpec command for Windsurf
- **THEN** the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
- **AND** file path SHALL follow pattern `.windsurf/workflows/qsx-<id>.md`

#### Scenario: Windsurf adapter formatting for legacy workflows

- **WHEN** formatting a legacy OpenSpec command for Windsurf
- **THEN** file path SHALL follow pattern `.windsurf/workflows/opsx-<id>.md`

### Requirement: QASpec command id prefix

When generating commands for QASpec workflows, adapters SHALL use the `qsx-` file prefix and `/qsx:` slash name prefix instead of `opsx-` and `/opsx:`.

#### Scenario: Cursor QASpec command path

- **WHEN** generating the `analyze` command for Cursor with QASpec templates
- **THEN** `getFilePath('analyze')` resolves to `.cursor/commands/qsx-analyze.md` using path.join
- **AND** formatted frontmatter `name` is `/qsx:analyze`

#### Scenario: Hyphen transform tools

- **WHEN** generating commands for OpenCode or Pi with hyphen command syntax
- **THEN** `transformToHyphenCommands` converts `/qsx:` to `/qsx-` in instruction bodies

### Requirement: Command metadata categories

Generated command metadata SHALL use **QASpec** as the category for QA workflow commands and **OpenSpec** only for explicitly legacy `opsx-*` workflow commands.

#### Scenario: QASpec workflow command

- **WHEN** generating a `/qsx:*` or QASpec-native slash command
- **THEN** `category` SHALL be `QASpec` (not `OpenSpec`)

#### Scenario: Legacy opsx command

- **WHEN** generating a legacy `/opsx:*` command for optional legacy profile
- **THEN** `category` MAY be `OpenSpec` with description noting legacy upstream workflow
