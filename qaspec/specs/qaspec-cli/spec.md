# qaspec-cli Specification

## Purpose

QASpec ships a single CLI binary (`qaspec`) for planning-home resolution, schema-driven changes, QA workflow scaffolding (`qaspec init` / `qaspec update`), and spec-driven tooling inherited from the OpenSpec fork. The fork repository dogfoods under `qaspec/`; consumer projects may use `qaspec/` or legacy `openspec/` until they migrate.
## Requirements
### Requirement: Primary CLI binary name

The published package SHALL expose `qaspec` as the primary executable name for all CLI commands (`init`, `new`, `status`, `continue`, `archive`, `schema`, `workspace`, etc.).

#### Scenario: User invokes primary binary

- **WHEN** a user runs `qaspec --help`
- **THEN** help output identifies the program as QASpec (not OpenSpec)
- **AND** subcommands match the existing OpenSpec command surface with QASpec branding

#### Scenario: Global install

- **WHEN** a user installs the package globally from this fork
- **THEN** `qaspec` is available on PATH via npm `bin` mapping
- **AND** package name in `package.json` is `@qaspec/cli` (or documented equivalent)

### Requirement: No qas CLI binary

The product SHALL NOT register a `qas` npm binary; the short prefix `qas` remains reserved for agent slash commands (`/qas:analyze`, etc.).

#### Scenario: Package bin field

- **WHEN** reading `package.json` `bin` map
- **THEN** only `qaspec` is listed
- **AND** no `openspec` or `qas` key exists

