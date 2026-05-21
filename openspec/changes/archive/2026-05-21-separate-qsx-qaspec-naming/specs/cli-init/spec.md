## MODIFIED Requirements

### Requirement: Legacy global profile migration before init

Before resolving workflows for skill and command generation, `qaspec init` SHALL upgrade a global `custom` profile whose workflows exactly match the legacy OpenSpec core set (`propose`, `explore`, `apply`, `archive`) to the QASpec `core` profile.

#### Scenario: Fresh init with stale global config

- **WHEN** global config has `profile: custom` and workflows `propose`, `explore`, `apply`, `archive` only
- **AND** the user runs `qaspec init` on a new project with `--tools cursor` (or another supported tool)
- **THEN** global config is saved with `profile: core` (and core workflows)
- **AND** init generates `qaspec-publish` under the tool skills directory
- **AND** init generates a `publish` slash command (e.g. `.cursor/commands/qsx-publish.md` with `/qsx:publish` in frontmatter)

#### Scenario: Intentional custom mix is preserved

- **WHEN** global config has `profile: custom` with workflows that are not exactly the legacy four-id set
- **THEN** init does not auto-change the profile
- **AND** generation follows the user-selected workflow list

### Requirement: QASpec core workflow messaging

Upon successful init with the QASpec core profile—or any active profile whose workflows include QASpec QA ids (`analyze`, `matrix`, or `publish`)—success output SHALL mention `/qsx:explore`, `/qsx:analyze`, `/qsx:matrix`, and `/qsx:publish` as primary next steps instead of `/opsx:propose` and `/opsx:apply`, and SHALL reference `qaspec` CLI commands (not `openspec`) in next-step hints.

#### Scenario: Post-init guidance after legacy migration

- **WHEN** init finishes configuring at least one AI tool
- **AND** the effective profile is `core` (including after legacy global-config migration)
- **THEN** the CLI prints next-step hints using `/qsx:*` command names including `/qsx:publish`
- **AND** printed examples use `qaspec` as the CLI name

#### Scenario: Post-init guidance for partial QAS workflows

- **WHEN** init finishes with a custom profile that includes `publish` (with or without `analyze`)
- **THEN** the CLI prints QASpec `/qsx:*` hints rather than legacy `/opsx:propose` guidance

### Requirement: AI Tool Configuration

The command SHALL configure AI coding assistants with skills and slash commands using a searchable multi-select experience.

#### Scenario: Prompting for AI tool selection

- **WHEN** run interactively
- **THEN** display animated welcome screen with OpenSpec logo
- **AND** present a searchable multi-select that shows all available tools
- **AND** mark already configured tools with "(configured ✓)" indicator
- **AND** pre-select configured tools for easy refresh
- **AND** sort configured tools to appear first in the list
- **AND** allow filtering by typing to search

#### Scenario: Selecting tools to configure

- **WHEN** user selects tools and confirms
- **THEN** generate QASpec workflow skills in `.<tool>/skills/qaspec-<id>/` for each selected tool when using the QASpec core profile
- **AND** generate slash commands as `qsx-<id>.md` (or tool-equivalent paths) with `/qsx:<id>` names for Cursor-class tools
- **AND** create `openspec/config.yaml` with default schema `qaspec-pr-review` when the QASpec product default applies
- **AND** generate legacy OpenSpec skills and `opsx-*` commands when the user selects a custom profile that includes legacy workflow ids

### Requirement: Success Output

The command SHALL provide clear, actionable next steps upon successful initialization.

#### Scenario: Displaying success message

- **WHEN** initialization completes successfully
- **THEN** display categorized summary:
  - "Created: <tools>" for newly configured tools
  - "Refreshed: <tools>" for already-configured tools that were updated
  - Count of skills and commands generated
- **AND** display getting started section with QASpec core hints (`/qsx:explore`, `/qsx:analyze`, `/qsx:matrix`, `/qsx:publish`) when the effective profile is `core` or when active workflows include any of `analyze`, `matrix`, or `publish`
- **OR** legacy OpenSpec hints (`/opsx:new`, `/opsx:continue`, `/opsx:apply`) when only legacy workflows are in the active profile
- **AND** display links to documentation and feedback

#### Scenario: Displaying restart instruction

- **WHEN** initialization completes successfully and tools were created or refreshed
- **THEN** display instruction to restart IDE for slash commands to take effect
