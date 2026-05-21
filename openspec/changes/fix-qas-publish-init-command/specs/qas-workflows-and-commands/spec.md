## ADDED Requirements

### Requirement: Legacy custom profile upgrades to QASpec core

When global configuration still reflects the pre-QASpec OpenSpec core workflow set, the CLI SHALL migrate it to the QASpec `core` profile before installing workflow artifacts.

#### Scenario: Legacy four-workflow global config

- **WHEN** global config has `profile: custom` and workflows are exactly `propose`, `explore`, `apply`, `archive`
- **AND** the user runs `qaspec init` or `qaspec update`
- **THEN** global config becomes `profile: core` with workflows `explore`, `analyze`, `matrix`, `publish`, `archive`
- **AND** `qas-publish` skill and `/qas:publish` command are generated when delivery includes skills and/or commands

## MODIFIED Requirements

### Requirement: Core workflow set

The QASpec product core profile SHALL install exactly these workflow ids: `explore`, `analyze`, `matrix`, `publish`, `archive`. Users whose global config was auto-migrated from the legacy OpenSpec core set SHALL receive this set on the next init or update without manual `qaspec config profile` steps.

#### Scenario: Init with core profile

- **WHEN** a user runs init with the QASpec core profile (including after legacy global-config migration)
- **THEN** skills are generated for all five workflow ids including `publish`
- **AND** workflows `propose`, `apply`, `sync`, `ff`, `verify`, and `onboard` are not installed unless the user selects a custom/full profile that explicitly includes them

#### Scenario: Publish artifacts present after migration

- **WHEN** init or update runs after legacy profile migration
- **THEN** `.cursor/skills/qas-publish/SKILL.md` exists when skills delivery is enabled
- **AND** a publish command file exists under the tool commands directory (e.g. `.cursor/commands/qas-publish.md`)

### Requirement: Slash command naming

Generated agent commands SHALL expose `/qas:<workflow>` (colon form) for tools that use colon slash commands, including `publish`.

#### Scenario: Cursor command files

- **WHEN** init configures Cursor with commands delivery and the active profile includes `publish`
- **THEN** `qas-publish.md` exists under `.cursor/commands/`
- **AND** frontmatter `name` is `/qas:publish`
