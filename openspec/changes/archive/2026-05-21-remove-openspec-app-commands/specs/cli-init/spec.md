## REMOVED Requirements

### Requirement: Legacy profile installs OpenSpec skills

**Reason:** QASpec no longer generates `openspec-*` skills for custom profiles.

**Migration:** Use core profile or install upstream OpenSpec separately.

## MODIFIED Requirements

### Requirement: QASpec core workflow messaging

Upon successful init with the QASpec core profile—or any active profile whose workflows include QASpec QA ids (`analyze`, `matrix`, or `publish`)—success output SHALL mention `/qas:explore`, `/qas:analyze`, `/qas:matrix`, and `/qas:publish` as primary next steps and SHALL reference `qaspec` CLI commands in next-step hints. Success output SHALL NOT mention `/opsx:propose`, `/opsx:apply`, or other legacy OpenSpec slash commands.

#### Scenario: Post-init guidance after legacy migration

- **WHEN** init finishes configuring at least one AI tool
- **AND** the effective profile is `core` (including after legacy global-config migration)
- **THEN** the CLI prints next-step hints using `/qas:*` command names including `/qas:publish`
- **AND** printed examples use `qaspec` as the CLI name
- **AND** no `/opsx:*` examples are printed

#### Scenario: Post-init guidance for partial QAS workflows

- **WHEN** init finishes with a custom profile that includes `publish` (with or without `analyze`)
- **THEN** the CLI prints QASpec `/qas:*` hints only

### Requirement: Skill generation

The command SHALL generate Agent Skills for selected AI tools. When upstream OpenSpec is active in the target project, the command SHALL generate only `qas-*` skills and SHALL skip all upstream-managed `openspec-*` skill paths. When upstream is not active, the command SHALL still generate only `qas-*` skills for QASpec workflows.

#### Scenario: Core profile skill install

- **WHEN** init runs with core profile and skills delivery enabled
- **THEN** create skill directories under `.<tool>/skills/` only for `qas-<workflow>` names
- **AND** do not create `openspec-*` skill directories

#### Scenario: Upstream coexistence skip

- **WHEN** upstream OpenSpec is active
- **AND** an `openspec-propose` skill already exists from upstream
- **THEN** init SHALL NOT overwrite that file
- **AND** SHALL create or update `qas-*` skills for the active QASpec profile

### Requirement: Slash command generation

The command SHALL generate slash commands only for selected tools that have a registered command adapter, while keeping adapterless tools valid for skill generation. When upstream OpenSpec is active, the command SHALL NOT write `opsx-*` command files. When upstream is not active, the command SHALL NOT write `opsx-*` or legacy `openspec-*` command files from QASpec templates.

#### Scenario: Cursor commands for core profile

- **WHEN** init configures Cursor with commands delivery and core profile
- **THEN** `.cursor/commands/qas-explore.md` (and siblings) are written or updated
- **AND** init does not write `.cursor/commands/opsx-propose.md` from QASpec templates

#### Scenario: Upstream opsx commands preserved

- **WHEN** upstream OpenSpec is active
- **AND** `.cursor/commands/opsx-apply.md` exists from upstream
- **THEN** init SHALL NOT overwrite that file

### Requirement: Post-init getting-started hints

Post-init getting-started hints SHALL use QASpec command names only (`/qas:*` and `qaspec` CLI).

#### Scenario: Core profile hints

- **WHEN** init completes with core profile
- **THEN** getting-started text describes the QASpec QA workflow
- **AND** does not label any `/opsx:*` flow as a supported QASpec install path
