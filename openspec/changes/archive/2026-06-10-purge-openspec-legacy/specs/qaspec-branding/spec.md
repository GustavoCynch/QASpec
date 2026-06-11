## MODIFIED Requirements

### Requirement: Branding regression guard

The repository SHALL include automated checks that prevent new inappropriate **OpenSpec** product strings and `openspec <subcommand>` examples in guarded surfaces. The allowlist SHALL be limited to lineage attribution, this repository's own planning-home directory paths, and historical records (CHANGELOG, archived changes).

#### Scenario: Failing on mis-branded docs

- **WHEN** a contributor adds user-facing text containing unallowlisted `OpenSpec` under `docs/`
- **THEN** the branding guard test SHALL fail

#### Scenario: Failing on openspec CLI examples in docs

- **WHEN** a contributor adds `openspec init` to `docs/cli.md`
- **THEN** the documentation command guard SHALL fail

#### Scenario: Allowlist covers lineage and history only

- **WHEN** the branding guard evaluates an `OpenSpec` match
- **THEN** it SHALL pass only for the README lineage attribution, literal `openspec/` path segments referring to this repository's planning home, or historical records
- **AND** migration- or coexistence-related allowlist entries no longer exist
