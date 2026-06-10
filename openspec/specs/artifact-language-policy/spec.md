# artifact-language-policy Specification

## Purpose

QASpec ships an English implementation while letting each project choose the language for QA artifacts, reference scaffolds, and user-facing agent output.

## Requirements

### Requirement: English implementation surface

All QASpec fork implementation assets SHALL be authored in English.

#### Scenario: Source and tooling language

- **WHEN** a contributor adds or modifies TypeScript under `src/`, tests, CLI help text, or bundled workflow template modules under `src/core/templates/workflows/`
- **THEN** user-visible strings in those files are written in English
- **AND** identifiers, comments, and commit messages for the fork follow English conventions

### Requirement: Project language for generated QA content

Change artifacts and user-facing workflow output for a QA project SHALL use the language declared in that project's `openspec/config.yaml`.

#### Scenario: Instructions injection

- **WHEN** an agent runs `openspec instructions <artifact-id> --json` for a `qaspec-pr-review` change
- **THEN** the response includes `context` and artifact-specific `rules` from config
- **AND** QASpec workflow templates instruct the agent to write `analysis.md`, `testcases.md`, and related files in that language

#### Scenario: Halt and case-list text

- **WHEN** `/qsx:analyze` or `/qsx:cases` presents a halt question or case titles to a human tester
- **THEN** the text is in the project language from config
- **AND** is not forced to English or any fixed locale by hardcoded template text in `src/`

### Requirement: No mandatory locale in core templates

Core QASpec workflow templates SHALL NOT hardcode a customer locale (for example mandatory Spanish) in the fork.

#### Scenario: Migrating qa-pr-review

- **WHEN** content is ported from `qa-pr-review` into the analyze / cases / publish workflow templates
- **THEN** locale-specific rules (observable wording, halt language) are expressed as config `rules` examples or docs
- **AND** the shipped default templates only reference "project language from config"

### Requirement: Localized reference scaffolds on init

When init creates `qaspec/references/*.md` for the first time, the seed content SHALL match the project's configured language.

#### Scenario: First init with Spanish context

- **WHEN** init creates config with Spanish declared in `context` (user prompt or existing config)
- **THEN** new `historical_bugs.md` and `qase_test_case_rules.md` scaffolds are written in Spanish
- **AND** existing reference files are not overwritten

#### Scenario: English default

- **WHEN** no language is declared in config at init time
- **THEN** scaffolds default to English
- **AND** generated config includes a commented or explicit `Language: English` hint in `context` for the user to change

### Requirement: Schema templates are structural English

Bundled schema template files under `schemas/qaspec-pr-review/templates/` MAY use English section headings; filled artifact body text SHALL still follow project language via instructions and config.

#### Scenario: Agent fills analysis template

- **WHEN** an agent creates `analysis.md` from the schema template
- **THEN** narrative content inside sections is in the project language
- **AND** structural placeholders in the template file do not override config language rules
