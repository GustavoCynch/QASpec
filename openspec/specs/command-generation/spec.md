# command-generation Specification

## Purpose
Define tool-agnostic command content and adapter contracts for generating tool-specific OpenSpec command files.
## Requirements
### Requirement: CommandContent interface

The system SHALL define a tool-agnostic `CommandContent` interface for command data.

#### Scenario: CommandContent structure

- **WHEN** defining a command to generate
- **THEN** `CommandContent` SHALL include:
  - `id`: string identifier (e.g., 'explore', 'analyze', 'matrix', 'publish')
  - `name`: human-readable name (e.g., 'QASpec Analyze')
  - `description`: brief description of command purpose
  - `category`: grouping category (e.g., 'QASpec' or 'OpenSpec')
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

#### Scenario: Claude adapter formatting for QASpec workflows

- **WHEN** formatting a QASpec command for Claude Code
- **THEN** the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
- **AND** file path SHALL follow pattern `.claude/commands/qas/<id>.md`

#### Scenario: Claude adapter formatting for legacy workflows

- **WHEN** formatting a legacy OpenSpec command for Claude Code
- **THEN** file path SHALL follow pattern `.claude/commands/opsx/<id>.md`

#### Scenario: Cursor adapter formatting for QASpec workflows

- **WHEN** formatting a QASpec command for Cursor
- **THEN** the adapter SHALL output YAML frontmatter with `name` as `/qas:<id>`, `id` as `qas-<id>`, `category`, `description` fields
- **AND** file path SHALL follow pattern `.cursor/commands/qas-<id>.md`

#### Scenario: Cursor adapter formatting for legacy workflows

- **WHEN** formatting a legacy OpenSpec command for Cursor
- **THEN** frontmatter `name` SHALL use `/opsx:<id>` form
- **AND** file path SHALL follow pattern `.cursor/commands/opsx-<id>.md`

#### Scenario: Windsurf adapter formatting for QASpec workflows

- **WHEN** formatting a QASpec command for Windsurf
- **THEN** the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
- **AND** file path SHALL follow pattern `.windsurf/workflows/qas-<id>.md`

#### Scenario: Windsurf adapter formatting for legacy workflows

- **WHEN** formatting a legacy OpenSpec command for Windsurf
- **THEN** file path SHALL follow pattern `.windsurf/workflows/opsx-<id>.md`

### Requirement: Command generator function

The system SHALL provide a `generateCommand` function that combines content with adapter.

#### Scenario: Generate command file

- **WHEN** calling `generateCommand(content, adapter)`
- **THEN** it SHALL return an object with:
  - `path`: the file path from `adapter.getFilePath(content.id)`
  - `fileContent`: the formatted content from `adapter.formatFile(content)`

#### Scenario: Generate multiple commands

- **WHEN** generating all opsx commands for a tool
- **THEN** the system SHALL iterate over command contents and generate each using the tool's adapter

### Requirement: CommandAdapterRegistry

The system SHALL provide a registry for looking up tool adapters.

#### Scenario: Get adapter by tool ID

- **WHEN** calling `CommandAdapterRegistry.get('cursor')`
- **THEN** it SHALL return the Cursor adapter or undefined if not registered

#### Scenario: Get all adapters

- **WHEN** calling `CommandAdapterRegistry.getAll()`
- **THEN** it SHALL return array of all registered adapters

#### Scenario: Adapter not found

- **WHEN** looking up an adapter for unregistered tool
- **THEN** `CommandAdapterRegistry.get()` SHALL return undefined
- **AND** caller SHALL handle missing adapter appropriately

### Requirement: Shared command body content

The body content of commands SHALL be shared across all tools.

#### Scenario: Same instructions across tools

- **WHEN** generating the 'explore' command for Claude and Cursor
- **THEN** both SHALL use the same `body` content
- **AND** only the frontmatter and file path SHALL differ

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

The skill generation registry SHALL map workflow ids `explore`, `analyze`, `matrix`, `publish`, and `archive` to QASpec template getters. Init and update SHALL emit the `publish` command whenever `publish` is in the resolved active workflow list (including after legacy global-config migration to core).

#### Scenario: Core profile command set

- **WHEN** init or update resolves workflows to the QASpec core profile
- **THEN** `getCommandContents()` includes an entry with `id: publish`
- **AND** generated command files use the QASpec naming convention for the target tool adapter

#### Scenario: Filtered generation

- **WHEN** init requests workflows `['analyze', 'matrix']` only
- **THEN** only matching QASpec command and skill templates are emitted
- **AND** `publish` is not emitted

### Requirement: Command metadata categories

Generated command metadata SHALL use **QASpec** as the category for QA workflow commands and **OpenSpec** only for explicitly legacy `opsx-*` workflow commands.

#### Scenario: QASpec workflow command

- **WHEN** generating a `/qas:*` or QASpec-native slash command
- **THEN** `category` SHALL be `QASpec` (not `OpenSpec`)

#### Scenario: Legacy opsx command

- **WHEN** generating a legacy `/opsx:*` command for optional legacy profile
- **THEN** `category` MAY be `OpenSpec` with description noting legacy upstream workflow

