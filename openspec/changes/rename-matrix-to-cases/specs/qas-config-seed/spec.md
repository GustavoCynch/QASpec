# qas-config-seed Delta

## RENAMED Requirements

- FROM: `### Requirement: Test-matrix seed rules require enriched case bodies`
- TO: `### Requirement: Test-cases seed rules require enriched case bodies`

## MODIFIED Requirements

### Requirement: Test-cases seed rules require enriched case bodies

The init seed for `rules.test-cases` SHALL instruct agents to write preconditions and steps under each checkbox case, built from sources in hand, with generic steps only when sources lack actionable detail.

#### Scenario: Seeded test-cases rules mention enriched format

- **WHEN** `getQaspecPrReviewConfigSeed()` supplies `rules.test-cases`
- **THEN** at least one active rule requires **Preconditions** and **Steps** blocks per case in `testcases.md`
- **AND** at least one active rule forbids inventing vague flows when concrete UI or requirement detail exists in sources
- **AND** rules remain keyed as `test-cases` for instruction injection

### Requirement: Seed documents multipleSubagents defaults

When init creates a new project config with schema `qaspec-pr-review`, the seed SHALL include `workflow.multipleSubagents` with `review: false` and `cases: false` unless the user already supplied values.

#### Scenario: Fresh init includes workflow block

- **WHEN** init creates `qaspec/config.yaml` with `schema: qaspec-pr-review` and no prior config existed
- **THEN** the file contains `workflow.multipleSubagents.review: false`
- **AND** the file contains `workflow.multipleSubagents.cases: false`
- **AND** a short comment or context line explains that `true` enables dual blind Task analysts for that phase

#### Scenario: Existing config is not overwritten

- **WHEN** init runs in extend mode and config already exists
- **THEN** the CLI does not replace existing `workflow` settings

### Requirement: Active QA config seed on first init

When init creates a new project config with schema `qaspec-pr-review`, the CLI SHALL write an active (uncommented) `context` block and `rules` entries for artifact ids `analyze`, `test-cases`, `specs`, and `apply` that encode the default QA role and phase rules ported from the reference `qa-pr-review` pack.

#### Scenario: Fresh init with qaspec-pr-review default schema

- **WHEN** init creates `qaspec/config.yaml` (or `openspec/config.yaml` per planning home) with `schema: qaspec-pr-review`
- **AND** no prior config file existed
- **THEN** the file contains a non-empty `context: |` block including QA role (read-only on application source), language declaration, and stack placeholders teams may edit
- **AND** the file contains `rules.analyze`, `rules.test-cases`, `rules.specs`, and `rules.apply` each with at least one active rule line
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

QA rule keys in the init seed SHALL use the exact artifact ids from the `qaspec-pr-review` schema (`analyze`, `test-cases`, `specs`, `apply`) so `qaspec instructions <id> --json` injects them without validation warnings.

#### Scenario: Instructions JSON includes seeded rules

- **WHEN** a project was initialized with the QA config seed
- **AND** an agent runs `qaspec instructions analyze --change <name> --json`
- **THEN** the JSON `rules` array is non-empty for analyze
- **AND** no config validation warning is emitted for unknown artifact ids under `rules`
