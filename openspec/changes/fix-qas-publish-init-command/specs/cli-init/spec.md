## ADDED Requirements

### Requirement: Legacy global profile migration before init

Before resolving workflows for skill and command generation, `qaspec init` SHALL upgrade a global `custom` profile whose workflows exactly match the legacy OpenSpec core set (`propose`, `explore`, `apply`, `archive`) to the QASpec `core` profile.

#### Scenario: Fresh init with stale global config

- **WHEN** global config has `profile: custom` and workflows `propose`, `explore`, `apply`, `archive` only
- **AND** the user runs `qaspec init` on a new project with `--tools cursor` (or another supported tool)
- **THEN** global config is saved with `profile: core` (and core workflows)
- **AND** init generates `qas-publish` under the tool skills directory
- **AND** init generates a `publish` slash command (e.g. `.cursor/commands/qas-publish.md` with `/qas:publish` in frontmatter)

#### Scenario: Intentional custom mix is preserved

- **WHEN** global config has `profile: custom` with workflows that are not exactly the legacy four-id set
- **THEN** init does not auto-change the profile
- **AND** generation follows the user-selected workflow list

## MODIFIED Requirements

### Requirement: QASpec core workflow messaging

Upon successful init with the QASpec core profile—or any active profile whose workflows include QASpec QA ids (`analyze`, `matrix`, or `publish`)—success output SHALL mention `/qas:explore`, `/qas:analyze`, `/qas:matrix`, and `/qas:publish` as primary next steps instead of `/opsx:propose` and `/opsx:apply`.

#### Scenario: Post-init guidance after legacy migration

- **WHEN** init finishes configuring at least one AI tool
- **AND** the effective profile is `core` (including after legacy global-config migration)
- **THEN** the CLI prints next-step hints using `/qas:*` command names including `/qas:publish`

#### Scenario: Post-init guidance for partial QAS workflows

- **WHEN** init finishes with a custom profile that includes `publish` (with or without `analyze`)
- **THEN** the CLI prints QASpec `/qas:*` hints rather than legacy `/opsx:propose` guidance

### Requirement: Success Output

The command SHALL provide clear, actionable next steps upon successful initialization.

#### Scenario: Displaying success message

- **WHEN** initialization completes successfully
- **THEN** display categorized summary:
  - "Created: <tools>" for newly configured tools
  - "Refreshed: <tools>" for already-configured tools that were updated
  - Count of skills and commands generated
- **AND** display getting started section with QASpec core hints (`/qas:explore`, `/qas:analyze`, `/qas:matrix`, `/qas:publish`) when the effective profile is `core` or when active workflows include any of `analyze`, `matrix`, or `publish`
- **OR** legacy OpenSpec hints (`/opsx:new`, `/opsx:continue`, `/opsx:apply`) when only legacy workflows are in the active profile
- **AND** display links to documentation and feedback

#### Scenario: Displaying restart instruction

- **WHEN** initialization completes successfully and tools were created or refreshed
- **THEN** display instruction to restart IDE for slash commands to take effect
