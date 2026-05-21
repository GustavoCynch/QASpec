## ADDED Requirements

### Requirement: Locale and role live in config seed

Default QA role, language policy, and phase-specific narrative rules for consumer projects SHALL ship in the init config seed (`context` and `rules`), not in generated skill bodies under `src/`.

#### Scenario: Spanish team edits config only

- **WHEN** a team changes `context` to declare Spanish and updates `rules.analyze` for Spanish halts
- **THEN** `/qas:analyze` behavior follows config on the next run without editing fork TypeScript templates
- **AND** `qaspec update` refreshes English orchestration text without removing the team's Spanish config

## MODIFIED Requirements

### Requirement: No mandatory locale in core templates

Core QASpec workflow templates SHALL NOT hardcode a customer locale (for example mandatory Spanish) in the fork. Default locale examples for `qaspec-pr-review` MAY appear in the init config seed in English with an explicit Language line teams edit.

#### Scenario: Migrating qa-pr-review

- **WHEN** content is ported from `qa-pr-review` into the product surface
- **THEN** locale-specific rules (observable wording, halt language) are expressed in init `rules` and documented in `docs/multi-language.md`
- **AND** shipped workflow templates in `src/` only reference "project language from config"

#### Scenario: English default in seed

- **WHEN** init creates config for `qaspec-pr-review` without user language input
- **THEN** the seed `context` includes an explicit English language line teams may change
- **AND** reference scaffolds under `qaspec/references/` are created in English unless config already declared another language
