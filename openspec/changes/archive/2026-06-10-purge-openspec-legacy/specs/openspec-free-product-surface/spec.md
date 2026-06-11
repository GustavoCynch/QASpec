## ADDED Requirements

### Requirement: Product surface free of OpenSpec runtime artifacts

The installed product SHALL expose only QASpec-named runtime artifacts: configuration is read from `qaspec/` and `~/.config/qaspec/` (XDG-resolved) only, per-change metadata is stored in `.qaspec.yaml` only, behavior is controlled by `QASPEC_*` environment variables only, and no network calls are made to OpenSpec-owned endpoints.

#### Scenario: No OPENSPEC_* environment variables

- **WHEN** a user sets any `OPENSPEC_*` environment variable
- **THEN** QASpec behavior is unaffected
- **AND** `--help` output and docs mention only `QASPEC_*` variables

#### Scenario: No .openspec.yaml artifacts generated

- **WHEN** any QASpec command creates or updates per-change metadata
- **THEN** the file is named `.qaspec.yaml`
- **AND** no command reads or writes a `.openspec.yaml` file

#### Scenario: No upstream network endpoints

- **WHEN** any QASpec command runs
- **THEN** no request is sent to `openspec.dev` or any upstream-owned host

#### Scenario: Cross-platform config locations

- **WHEN** resolving user-level configuration on Unix, macOS, or Windows
- **THEN** the directory leaf is `qaspec` (e.g. `~/.config/qaspec`, `%APPDATA%\qaspec`), built with platform path APIs

## MODIFIED Requirements

### Requirement: Automated regression guards

The repository SHALL fail CI when new unallowlisted OpenSpec product strings or `openspec <subcommand>` examples appear in guarded paths, including the bodies of generated skill and command templates.

#### Scenario: Docs branding scan

- **WHEN** CI runs branding tests after a contributor adds "OpenSpec" to `docs/cli.md` without allowlist
- **THEN** the build fails

#### Scenario: Generated skill bodies scan

- **WHEN** CI runs branding tests and a skill or command template body instructs running an `openspec <subcommand>` (e.g. `openspec feedback`)
- **THEN** the build fails

#### Scenario: Allowlisted repo spec path

- **WHEN** maintainer documentation references `openspec/changes/archive/` as historical storage
- **THEN** the branding guard allowlist permits that path literal
- **AND** the line does not present OpenSpec as the product name
