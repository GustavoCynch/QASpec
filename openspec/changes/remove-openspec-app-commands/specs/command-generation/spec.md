## REMOVED Requirements

### Requirement: Claude adapter formatting for legacy workflows

**Reason:** QASpec no longer generates legacy OpenSpec commands.

**Migration:** Use QASpec adapters and `.claude/commands/qas/<id>.md` paths only.

### Requirement: Cursor adapter formatting for legacy workflows

**Reason:** QASpec no longer generates `/opsx:*` commands.

**Migration:** Use `/qas:*` and `.cursor/commands/qas-<id>.md` only.

### Requirement: Windsurf adapter formatting for legacy workflows

**Reason:** QASpec no longer generates `opsx-*` workflow files.

**Migration:** Use `.windsurf/workflows/qas-<id>.md` only.

### Requirement: Command metadata categories

**Reason:** No legacy `opsx-*` commands are emitted.

**Migration:** All generated commands use category **QASpec**.

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

### Requirement: Command generator function

The system SHALL provide a `generateCommand` function that combines content with adapter.

#### Scenario: Generate command file

- **WHEN** calling `generateCommand(content, adapter)`
- **THEN** it SHALL return an object with:
  - `path`: the file path from `adapter.getFilePath(content.id)`
  - `fileContent`: the formatted content from `adapter.formatFile(content)`

#### Scenario: Generate multiple commands

- **WHEN** generating all QASpec commands for a tool
- **THEN** the system SHALL iterate over QASpec command contents and generate each using the tool's adapter

### Requirement: QASpec command id prefix

When generating commands for QASpec workflows, adapters SHALL use the `qas-` file prefix and `/qas:` slash name prefix. Adapters SHALL NOT emit `opsx-` or `/opsx:` paths from QASpec generation.

#### Scenario: Cursor QASpec command path

- **WHEN** generating the `analyze` command for Cursor with QASpec templates
- **THEN** `getFilePath('analyze')` resolves to `.cursor/commands/qas-analyze.md` using path.join
- **AND** formatted frontmatter `name` is `/qas:analyze`

#### Scenario: Hyphen transform tools

- **WHEN** generating commands for OpenCode or Pi with hyphen command syntax
- **THEN** `transformToHyphenCommands` converts `/qas:` to `/qas-` in instruction bodies

### Requirement: QASpec command content registry

The skill generation registry SHALL map workflow ids `explore`, `analyze`, `matrix`, `publish`, and `archive` to QASpec template getters only. Init and update SHALL emit the `publish` command whenever `publish` is in the resolved active workflow list (including after legacy global-config migration to core).

#### Scenario: Core profile command set

- **WHEN** init or update resolves workflows to the QASpec core profile
- **THEN** `getCommandContents()` includes entries only for QASpec workflow ids
- **AND** generated command files use the QASpec naming convention for the target tool adapter

#### Scenario: Filtered generation

- **WHEN** init requests workflows `['analyze', 'matrix']` only
- **THEN** only matching QASpec command and skill templates are emitted
- **AND** `publish` is not emitted
