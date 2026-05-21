# qaspec-cli Specification

## Purpose

Define the primary CLI binary surface for the QASpec package (`qaspec`) and compatibility shims.

## Requirements

### Requirement: Primary CLI binary name

The published package SHALL expose `qaspec` as the **only** executable name for all CLI commands (`init`, `new`, `status`, `continue`, `archive`, `schema`, `workspace`, etc.).

#### Scenario: User invokes primary binary

- **WHEN** a user runs `qaspec --help`
- **THEN** help output identifies the program as QASpec
- **AND** subcommands are listed under the `qaspec` program name

#### Scenario: Global install

- **WHEN** a user installs the package globally from this fork
- **THEN** `qaspec` is available on PATH via npm `bin` mapping
- **AND** package name in `package.json` is `@qaspec/cli` (or documented equivalent)
- **AND** `openspec` is not installed as a global binary from this package

### Requirement: No qas CLI binary

The product SHALL NOT register a `qas` npm binary; the short prefix `qas` remains reserved for agent slash commands (`/qas:analyze`, etc.).

#### Scenario: Package bin field

- **WHEN** reading `package.json` `bin` map
- **THEN** only `qaspec` is listed
- **AND** no `qas` or `openspec` key exists
