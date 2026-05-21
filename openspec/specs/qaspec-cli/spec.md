# qaspec-cli Specification

## Purpose

Define the primary CLI binary surface for the QASpec package (`qaspec`) and compatibility shims.

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

### Requirement: Deprecated openspec binary shim

The package SHALL continue to expose an `openspec` executable that delegates to the same implementation as `qaspec`.

#### Scenario: Legacy invocation

- **WHEN** a user runs `openspec status`
- **THEN** the command succeeds with identical behavior to `qaspec status`
- **AND** stderr includes a one-time deprecation notice recommending `qaspec`

#### Scenario: No separate openspec codebase

- **WHEN** maintainers inspect `bin/`
- **THEN** `openspec` and `qaspec` entrypoints share one implementation path (no duplicated CLI logic)

### Requirement: No qas CLI binary

The product SHALL NOT register a `qas` npm binary; the short prefix `qas` remains reserved for agent slash commands (`/qas:analyze`, etc.).

#### Scenario: Package bin field

- **WHEN** reading `package.json` `bin` map
- **THEN** only `qaspec` and `openspec` (shim) are listed
- **AND** no `qas` key exists
