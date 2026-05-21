## MODIFIED Requirements

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
