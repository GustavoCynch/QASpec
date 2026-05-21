## ADDED Requirements

### Requirement: Command metadata categories

Generated command metadata SHALL use **QASpec** as the category for QA workflow commands and **OpenSpec** only for explicitly legacy `opsx-*` workflow commands.

#### Scenario: QASpec workflow command

- **WHEN** generating a `/qas:*` or QASpec-native slash command
- **THEN** `category` SHALL be `QASpec` (not `OpenSpec`)

#### Scenario: Legacy opsx command

- **WHEN** generating a legacy `/opsx:*` command for optional legacy profile
- **THEN** `category` MAY be `OpenSpec` with description noting legacy upstream workflow
