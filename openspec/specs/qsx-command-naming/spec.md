# qsx-command-naming Specification

## Purpose
Define how QASpec names generated slash commands and command files using the short `qsx` prefix, distinct from upstream `opsx` planning commands.
## Requirements
### Requirement: Short command prefix for QASpec workflows

QASpec SHALL use the **`qsx`** prefix for all generated slash commands of the QASpec core profile, analogous to upstream **`opsx`** for OpenSpec planning workflows.

#### Scenario: Cursor command file naming

- **WHEN** init or update generates Cursor commands for workflow `cases`
- **THEN** the command file SHALL be `.cursor/commands/qsx-cases.md`
- **AND** frontmatter `id` SHALL be `qsx-cases`

#### Scenario: Colon slash command name

- **WHEN** the target tool uses colon-style slash commands (e.g. Cursor)
- **THEN** frontmatter `name` SHALL be `/qsx:cases` for workflow `cases`

#### Scenario: Distinct from skill autocomplete

- **WHEN** a user types `/qs` in Cursor command autocomplete
- **THEN** QASpec workflow commands appear under `/qsx:*`
- **AND** QASpec skills appear under `qaspec-*` names, not `/qas:*` or `qas-*` command filenames

### Requirement: Command prefix constants

The CLI SHALL define `QASPEC_COMMAND_PREFIX = 'qsx'` in a single module and SHALL derive file bases and slash names from that constant for all tool adapters.

#### Scenario: Adapter uses shared helpers

- **WHEN** any `ToolCommandAdapter` resolves a QASpec workflow command path
- **THEN** it SHALL call shared helpers (e.g. `qasCommandFileBase`, `qasSlashCommandName`) rather than hardcoding `qas-` or `/qas:`

### Requirement: Hyphen-syntax tools

For tools that transform colon commands to hyphen form (OpenCode, Pi), instruction bodies SHALL use `/qsx-<workflow>` after transform, not `/qas-`.

#### Scenario: Pi prompt references

- **WHEN** a generated Pi command body references another workflow
- **THEN** cross-references use `/qsx-analyze` (or equivalent) after hyphen transform

