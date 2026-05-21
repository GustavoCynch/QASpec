## ADDED Requirements

### Requirement: Active QA config seed on first init

When init creates a new project config with schema `qaspec-pr-review`, the CLI SHALL write an active (uncommented) `context` block and `rules` entries for artifact ids `analyze`, `test-matrix`, `specs`, and `apply` that encode the default QA role and phase rules ported from the reference `qa-pr-review` pack.

#### Scenario: Fresh init with qaspec-pr-review default schema

- **WHEN** init creates `qaspec/config.yaml` (or `openspec/config.yaml` per planning home) with `schema: qaspec-pr-review`
- **AND** no prior config file existed
- **THEN** the file contains a non-empty `context: |` block including QA role (read-only on application source), language declaration, and stack placeholders teams may edit
- **AND** the file contains `rules.analyze`, `rules.test-matrix`, `rules.specs`, and `rules.apply` each with at least one active rule line
- **AND** rules content is maintained in English in the fork seed module

#### Scenario: Existing config is not overwritten

- **WHEN** init runs in extend mode and config already exists
- **THEN** the CLI does not replace existing `context` or `rules`
- **AND** init output indicates config was preserved

#### Scenario: Update does not rewrite consumer config

- **WHEN** a user runs `qaspec update`
- **THEN** generated skills and commands refresh
- **AND** the project's `config.yaml` is not modified solely by update

### Requirement: Seed rules align with artifact graph ids

QA rule keys in the init seed SHALL use the exact artifact ids from the `qaspec-pr-review` schema (`analyze`, `test-matrix`, `specs`, `apply`) so `qaspec instructions <id> --json` injects them without validation warnings.

#### Scenario: Instructions JSON includes seeded rules

- **WHEN** a project was initialized with the QA config seed
- **AND** an agent runs `qaspec instructions analyze --change <name> --json`
- **THEN** the JSON `rules` array is non-empty for analyze
- **AND** no config validation warning is emitted for unknown artifact ids under `rules`
