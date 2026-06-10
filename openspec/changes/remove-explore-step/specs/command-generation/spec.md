# command-generation Delta

## MODIFIED Requirements

### Requirement: Shared command body content

The body content of commands SHALL be shared across all tools.

#### Scenario: Same instructions across tools

- **WHEN** generating the 'analyze' command for Claude and Cursor
- **THEN** both SHALL use the same `body` content
- **AND** only the frontmatter and file path SHALL differ

### Requirement: QASpec command content registry

The skill generation registry SHALL map workflow ids `analyze`, `matrix`, `publish`, and `archive` to QASpec template getters. `explore` SHALL NOT be a recognized QASpec workflow id. Init and update SHALL emit the `publish` command whenever `publish` is in the resolved active workflow list (including after legacy global-config migration to core).

#### Scenario: Core profile command set

- **WHEN** init or update resolves workflows to the QASpec core profile
- **THEN** `getCommandContents()` includes an entry with `id: publish`
- **AND** no entry with `id: explore` is produced
