## MODIFIED Requirements

### Requirement: No qas CLI binary

The product SHALL NOT register a `qas` npm binary; the short prefix `qas` remains reserved for agent slash commands (`/qas:analyze`, etc.).

#### Scenario: Package bin field

- **WHEN** reading `package.json` `bin` map
- **THEN** only `qaspec` is listed
- **AND** no `openspec` or `qas` key exists
