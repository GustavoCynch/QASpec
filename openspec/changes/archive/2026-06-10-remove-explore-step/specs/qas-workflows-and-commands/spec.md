# qas-workflows-and-commands Delta

## MODIFIED Requirements

### Requirement: Upstream OpenSpec workflow artifacts are not replaced

When upstream OpenSpec is active in a project, QASpec init and update SHALL install only the QASpec core (`qaspec-*` skills and `qsx-*` commands) workflow surface and SHALL leave upstream `openspec-*` skills and `opsx-*` commands unchanged.

#### Scenario: Core profile beside upstream OpenSpec

- **GIVEN** upstream OpenSpec is active with `openspec-propose` and `openspec-apply-change` skills already installed
- **WHEN** the user runs `qaspec init` with the QASpec core profile
- **THEN** `qaspec-analyze`, `qaspec-matrix`, `qaspec-publish`, and `qaspec-archive` skills are created or updated
- **AND** `openspec-propose` and `openspec-apply-change` skill files are not modified by QASpec

#### Scenario: Custom profile with legacy OpenSpec workflows

- **GIVEN** upstream OpenSpec is active
- **WHEN** the user selects a custom profile that includes `propose`, `apply`, or other `openspec-*` workflow ids
- **THEN** QASpec still does not overwrite existing upstream `openspec-*` skills or `opsx-*` commands
- **AND** QASpec `qaspec-*` skills for enabled QASpec workflows are still installed

### Requirement: Legacy custom profile upgrades to QASpec core

When global configuration still reflects the pre-QASpec OpenSpec core workflow set, the CLI SHALL migrate it to the QASpec `core` profile before installing workflow artifacts.

#### Scenario: Legacy four-workflow global config

- **WHEN** global config has `profile: custom` and workflows are exactly `propose`, `explore`, `apply`, `archive`
- **AND** the user runs `qaspec init` or `qaspec update`
- **THEN** global config becomes `profile: core` with workflows `analyze`, `matrix`, `publish`, `archive`
- **AND** `qaspec-publish` skill and `/qsx:publish` command are generated when delivery includes skills and/or commands

### Requirement: Core workflow set

The QASpec product core profile SHALL install exactly these workflow ids: `analyze`, `matrix`, `publish`, `archive`. Users whose global config was auto-migrated from the legacy OpenSpec core set SHALL receive this set on the next init or update without manual `qaspec config profile` steps.

#### Scenario: Init with core profile

- **WHEN** a user runs init with the QASpec core profile (including after legacy global-config migration)
- **THEN** skills are generated for all four workflow ids including `publish`
- **AND** workflows `explore`, `propose`, `apply`, `sync`, `ff`, `verify`, and `onboard` are not installed unless the user selects a custom/full profile that explicitly includes them

#### Scenario: Publish artifacts present after migration

- **WHEN** init or update runs after legacy profile migration
- **THEN** `.cursor/skills/qaspec-publish/SKILL.md` exists when skills delivery is enabled
- **AND** a publish command file exists under the tool commands directory (e.g. `.cursor/commands/qsx-publish.md`)

### Requirement: Skill directory naming

Each installed skill SHALL use the `qaspec-<workflow>` directory name under the tool skills folder.

#### Scenario: Cursor skills layout

- **WHEN** init configures Cursor with skills delivery
- **THEN** files exist at `.cursor/skills/qaspec-analyze/SKILL.md` (and siblings for matrix, publish, archive)
- **AND** skill frontmatter `name` matches the directory (e.g. `qaspec-analyze`)

## ADDED Requirements

### Requirement: Stale explore artifacts are cleaned up

`qaspec init` and `qaspec update` SHALL remove previously generated `qaspec-explore` skill directories and `qsx` explore command files from configured tools, while leaving upstream `openspec-explore` skills and `opsx-*` commands untouched when upstream OpenSpec is active.

#### Scenario: Update removes explore files from an existing project

- **GIVEN** a project initialized with an earlier version that generated `.cursor/skills/qaspec-explore/SKILL.md` and `.cursor/commands/qsx-explore.md`
- **WHEN** the user runs `qaspec update`
- **THEN** the `qaspec-explore` skill directory and the explore command file are deleted
- **AND** the remaining `qaspec-*` skills and `qsx-*` commands are regenerated normally

#### Scenario: Upstream explore skill is preserved

- **GIVEN** upstream OpenSpec is active with an `openspec-explore` skill installed
- **WHEN** `qaspec init` or `qaspec update` runs
- **THEN** the `openspec-explore` skill files are not modified or deleted

### Requirement: Retired workflow ids are ignored at resolution

When a global or project profile lists a retired QASpec workflow id (such as `explore`), workflow resolution SHALL skip it with a short notice pointing to `/qsx:analyze`, and generation SHALL continue for the remaining workflows without error.

#### Scenario: Custom profile still lists explore

- **GIVEN** global config has `profile: custom` with workflows `explore`, `analyze`, `matrix`
- **WHEN** the user runs `qaspec init` or `qaspec update`
- **THEN** skills and commands are generated for `analyze` and `matrix`
- **AND** a notice explains that `explore` was retired and investigation now starts with `/qsx:analyze`
- **AND** the command exits successfully

## REMOVED Requirements

### Requirement: Explore workflow guardrails

**Reason**: The explore workflow is removed from the QASpec product surface. It produced no artifact, and `analisis.md` (analyze phase) is the sole source of truth for the matrix phase, so explore insights were structurally lost.

**Migration**: Investigate freely in normal chat or start directly with `/qsx:analyze`, which performs investigation and asks a clarification question before any matrix work.
