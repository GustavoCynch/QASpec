# openspec-free-product-surface Specification

## Purpose

Define requirements for a QASpec product surface free of OpenSpec branding in user-facing documentation, CLI binaries, and maintainer metadata.
## Requirements
### Requirement: Single product CLI binary

The published package SHALL expose only **`qaspec`** as an npm executable. The package SHALL NOT register an **`openspec`** binary in `package.json`.

#### Scenario: Package bin map

- **WHEN** a user inspects `package.json` `bin`
- **THEN** only `qaspec` is listed
- **AND** no `openspec` entry exists

#### Scenario: Legacy script failure with guidance

- **WHEN** a user runs `openspec status` after upgrading to a release that removed the shim
- **THEN** the shell reports command not found (or package no longer provides the binary)
- **AND** release notes direct users to `qaspec status`

### Requirement: Product documentation uses QASpec vocabulary only

Files under `docs/` SHALL describe the CLI as **`qaspec`**, the default planning home as **`qaspec/`**, and agent commands as **`/qas:*`**. They SHALL NOT include `docs/opsx.md` or `docs/migration-guide.md` as published product pages.

#### Scenario: CLI reference examples

- **WHEN** a reader opens `docs/cli.md`
- **THEN** command examples use `qaspec <subcommand>` form
- **AND** no line instructs `openspec init` or `openspec archive` as the primary interface

#### Scenario: Removed legacy product pages

- **WHEN** a reader browses the `docs/` index linked from README
- **THEN** `opsx.md` and `migration-guide.md` are not part of the product doc set
- **AND** README does not link to OPSX as the default workflow

### Requirement: Maintainer and packaging metadata

Root maintainer and environment files SHALL identify the product as QASpec, not OpenSpec.

#### Scenario: Nix flake description

- **WHEN** a developer reads `flake.nix` metadata
- **THEN** description and devshell welcome text refer to QASpec
- **AND** do not describe the repo as "OpenSpec"

#### Scenario: Maintainers file

- **WHEN** a reader opens `MAINTAINERS.md`
- **THEN** prose describes maintainers of QASpec (the fork), not "OpenSpec" as the product name

### Requirement: Workspace reimplementation docs

`WORKSPACE_REIMPLEMENTATION_DIRECTION.md` and `WORKSPACE_REIMPLEMENTATION_START_HERE.md` SHALL document **`qaspec workspace`** commands and QASpec workspace metadata naming, not `openspec workspace` or OpenSpec-branded paths as the target interface.

#### Scenario: Setup command examples

- **WHEN** a reader follows workspace reimplementation docs
- **THEN** examples use `qaspec workspace setup`, `qaspec workspace doctor`, etc.
- **AND** do not present `openspec workspace` as the command to run

### Requirement: Automated regression guards

The repository SHALL fail CI when new unallowlisted OpenSpec product strings or `openspec <subcommand>` examples appear in guarded paths.

#### Scenario: Docs branding scan

- **WHEN** CI runs branding tests after a contributor adds "OpenSpec" to `docs/cli.md` without allowlist
- **THEN** the build fails

#### Scenario: Allowlisted repo spec path

- **WHEN** maintainer documentation references `openspec/changes/archive/` as historical storage
- **THEN** the branding guard allowlist permits that path literal
- **AND** the line does not present OpenSpec as the product name

### Requirement: Public landing uses QASpec vocabulary

The deployed product landing site (when present) SHALL follow the same vocabulary rules as `docs/`: **`qaspec`** CLI, **`qaspec/`** planning home, **`/qas:*`** agent commands, and no primary CTA for **`openspec`** or **`/opsx:*`**.

#### Scenario: Landing install CTA

- **WHEN** a visitor uses the install snippet on the public landing page
- **THEN** the command uses `qaspec` / `@qaspec/cli` naming
- **AND** does not instruct `npm install -g @fission-ai/openspec` as the default path

#### Scenario: README points to public site

- **WHEN** a reader opens the root `README.md` after the site is deployed
- **THEN** they find a link to the live landing URL (once configured)
- **AND** GitHub remains the source for detailed `docs/`

