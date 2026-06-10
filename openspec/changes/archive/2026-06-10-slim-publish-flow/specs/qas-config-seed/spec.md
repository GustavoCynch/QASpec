# qas-config-seed Delta

## ADDED Requirements

### Requirement: Seed documents the tcms target block

When init creates a new project config with schema `qaspec-pr-review`, the seed SHALL include a commented `tcms` example block documenting `provider`, `project`, and `baseUrl`, explaining that publish fills or uses it as the project-wide TCMS target.

#### Scenario: Fresh init includes commented tcms example

- **WHEN** init creates `qaspec/config.yaml` with `schema: qaspec-pr-review` and no prior config existed
- **THEN** the file contains a commented `tcms` block showing `provider: qase`, a project code placeholder, and a base URL placeholder
- **AND** a comment states that `/qsx:publish` proposes and persists this target on first publish when the block is absent

#### Scenario: Existing config is not overwritten

- **WHEN** init runs in extend mode and config already exists
- **THEN** the CLI does not add or replace a `tcms` block

## MODIFIED Requirements

### Requirement: Active QA config seed on first init

When init creates a new project config with schema `qaspec-pr-review`, the CLI SHALL write an active (uncommented) `context` block and `rules` entries for artifact ids `analyze`, `test-cases`, `specs`, and `apply` that encode the default QA role and phase rules ported from the reference `qa-pr-review` pack. Seeded `rules.apply` SHALL describe the config-target and in-chat-summary publish flow and SHALL NOT direct agents to write `publish-plan.md` or `execution-context.md`.

#### Scenario: Fresh init with qaspec-pr-review default schema

- **WHEN** init creates `qaspec/config.yaml` (or `openspec/config.yaml` per planning home) with `schema: qaspec-pr-review`
- **AND** no prior config file existed
- **THEN** the file contains a non-empty `context: |` block including QA role (read-only on application source), language declaration, and stack placeholders teams may edit
- **AND** the file contains `rules.analyze`, `rules.test-cases`, `rules.specs`, and `rules.apply` each with at least one active rule line
- **AND** `rules.apply` references the `tcms` config target and the single confirmation halt, not prepare files
- **AND** rules content is maintained in English in the fork seed module

#### Scenario: Existing config is not overwritten

- **WHEN** init runs in extend mode and config already exists
- **THEN** the CLI does not replace existing `context` or `rules`
- **AND** init output indicates config was preserved

#### Scenario: Update does not rewrite consumer config

- **WHEN** a user runs `qaspec update`
- **THEN** generated skills and commands refresh
- **AND** the project's `config.yaml` is not modified solely by update
