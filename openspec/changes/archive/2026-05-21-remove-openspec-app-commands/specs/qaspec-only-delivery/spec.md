## ADDED Requirements

### Requirement: QASpec-only agent artifact generation

The QASpec CLI application SHALL install and update only QASpec-branded agent skills (`qas-<workflow>`) and slash commands (`/qas:<workflow>` or tool-equivalent paths using the `qas-` prefix). The CLI SHALL NOT generate, refresh, or reference `openspec-*` skill directories or `opsx-*` / legacy `openspec-*` command files as part of init or update.

#### Scenario: Fresh project init

- **WHEN** a user runs `qaspec init` with skills and/or commands delivery enabled
- **AND** the effective profile is `core`
- **THEN** only `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, and `qas-archive` skills are created under the selected tool skills path
- **AND** only matching `/qas:*` command files are created under the selected tool commands path
- **AND** no new `openspec-*` skill or `opsx-*` command files are written

#### Scenario: Update on existing QASpec project

- **WHEN** a user runs `qaspec update` with commands delivery enabled
- **AND** upstream OpenSpec is not active
- **THEN** QASpec refreshes `qas-*` artifacts for the active profile
- **AND** does not emit legacy OpenSpec command templates

### Requirement: Product messaging uses QASpec surface only

User-visible CLI output from init, update, migration, and workflow instruction helpers SHALL direct users to `/qas:*` commands and `qas-*` skills. Output SHALL NOT instruct users to run `/opsx:*` or to use `openspec-*` skills installed by QASpec.

#### Scenario: Post-init next steps

- **WHEN** init completes with the core profile
- **THEN** printed next-step examples use `/qas:explore` and sibling QASpec commands
- **AND** do not mention `/opsx:propose` or `/opsx:apply`

#### Scenario: Missing artifacts hint

- **WHEN** a workflow command reports missing change artifacts
- **THEN** the hint references completing artifacts via QASpec workflows (e.g. matrix/publish) or `qaspec` CLI
- **AND** does not name `openspec-continue-change` or other removed QASpec-generated OpenSpec skills

### Requirement: Repository-internal Cursor artifacts are exempt

Requirements in this capability apply to artifacts QASpec generates in **target projects**. They SHALL NOT require deletion of `openspec/` planning trees, committed `.cursor/commands/opsx-*` files, or committed `openspec-*` skills in the QASpec source repository used for maintainer spec-driven work.

#### Scenario: Fork repository layout

- **WHEN** a contributor clones the QASpec repository
- **THEN** `openspec/changes/` MAY exist unchanged
- **AND** `.cursor/commands/opsx-propose.md` MAY exist without violating QASpec-only delivery for consumer installs
