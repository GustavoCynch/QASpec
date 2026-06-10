# command-generation Delta

## MODIFIED Requirements

### Requirement: CommandContent interface

The system SHALL define a tool-agnostic `CommandContent` interface for command data.

#### Scenario: CommandContent structure

- **WHEN** defining a command to generate
- **THEN** `CommandContent` SHALL include:
  - `id`: string identifier (e.g., 'analyze', 'cases', 'publish')
  - `name`: human-readable name (e.g., 'QASpec Analyze')
  - `description`: brief description of command purpose
  - `category`: grouping category (e.g., 'QASpec' or 'OpenSpec')
  - `tags`: array of tag strings
  - `body`: the command instruction content

### Requirement: QASpec command content registry

The skill generation registry SHALL map workflow ids `analyze`, `cases`, `publish`, and `archive` to QASpec template getters. `explore` SHALL NOT be a recognized QASpec workflow id, and `matrix` SHALL resolve only through the rename mapping to `cases`. Init and update SHALL emit the `publish` command whenever `publish` is in the resolved active workflow list (including after legacy global-config migration to core).

#### Scenario: Core profile command set

- **WHEN** init or update resolves workflows to the QASpec core profile
- **THEN** `getCommandContents()` includes an entry with `id: cases` and an entry with `id: publish`
- **AND** no entry with `id: explore` or `id: matrix` is produced
