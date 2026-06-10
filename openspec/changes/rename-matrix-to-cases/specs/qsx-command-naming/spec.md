# qsx-command-naming Delta

## MODIFIED Requirements

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
