## REMOVED Requirements

### Requirement: Deprecated openspec binary shim

**Reason**: Transition period ended after `qaspec-cli-rename`; fork and docs standardize on `qaspec` only. Keeping two binaries adds confusion and test surface.

**Migration**: Replace `openspec` with `qaspec` in scripts, CI, and global installs (`npm i -g @qaspec/cli`). No `qas` CLI substitute.

## MODIFIED Requirements

### Requirement: No qas CLI binary

The product SHALL NOT register a `qas` npm binary; the short prefix `qas` remains reserved for agent slash commands (`/qas:analyze`, etc.).

#### Scenario: Package bin field

- **WHEN** reading `package.json` `bin` map
- **THEN** only `qaspec` is listed
- **AND** no `openspec` or `qas` key exists
