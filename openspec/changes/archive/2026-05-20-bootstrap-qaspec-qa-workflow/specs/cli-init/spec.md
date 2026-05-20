## ADDED Requirements

### Requirement: QASpec reference scaffolding on init

The `openspec init` command SHALL scaffold `qaspec/references/historical_bugs.md` and `qaspec/references/qase_test_case_rules.md` when missing, without overwriting existing files.

#### Scenario: References created on first init

- **WHEN** init completes successfully on a project without those files
- **THEN** both reference files exist under `qaspec/references/`
- **AND** existing reference files are unchanged on re-init

### Requirement: QASpec core workflow messaging

Upon successful init with the QASpec core profile, success output SHALL mention `/qas:explore`, `/qas:analyze`, `/qas:matrix`, and `/qas:publish` as primary next steps instead of `/opsx:propose` and `/opsx:apply`.

#### Scenario: Post-init guidance

- **WHEN** init finishes configuring at least one AI tool with the QASpec core profile
- **THEN** the CLI prints next-step hints using `/qas:*` command names

## MODIFIED Requirements

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
- **THEN** generate QASpec workflow skills in `.<tool>/skills/` directory for each selected tool when using the QASpec core profile
- **AND** generate slash commands as `qas-<id>.md` (or tool-equivalent paths) with `/qas:<id>` names for Cursor-class tools
- **AND** create `openspec/config.yaml` with default schema `qaspec-pr-review` when the QASpec product default applies
