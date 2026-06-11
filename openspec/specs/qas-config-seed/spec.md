# qas-config-seed Specification

## Purpose

Define the default `qaspec/config.yaml` seed for schema `qaspec-pr-review` on first init.
## Requirements
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

### Requirement: Seed documents the tcms target block

When init creates a new project config with schema `qaspec-pr-review`, the seed SHALL include a commented `tcms` example block documenting `provider`, `project`, and `baseUrl`, explaining that the block holds optional user-managed defaults, that the publish target lives per change in the change's `.openspec.yaml` (set via `qaspec tcms set`), and that publish never writes this block.

#### Scenario: Fresh init includes commented tcms example

- **WHEN** init creates `qaspec/config.yaml` with `schema: qaspec-pr-review` and no prior config existed
- **THEN** the file contains a commented `tcms` block showing `provider: qase`, a project code placeholder, and a base URL placeholder
- **AND** a comment states the block is user-managed defaults only and the per-change target is persisted via `qaspec tcms set`, never by publish writing this file

#### Scenario: Existing config is not overwritten

- **WHEN** init runs in extend mode and config already exists
- **THEN** the CLI does not add or replace a `tcms` block

### Requirement: Active QA config seed on first init

When init creates a new project config with schema `qaspec-pr-review`, the CLI SHALL write an active (uncommented) `context` block and `rules` entries for artifact ids `analyze`, `test-cases`, `specs`, and `apply` that encode the default QA role and phase rules ported from the reference `qa-pr-review` pack. Seeded `rules.apply` SHALL describe the config-target and in-chat-summary publish flow and SHALL NOT direct agents to write `publish-plan.md` or `execution-context.md`.

#### Scenario: Fresh init with qaspec-pr-review default schema

- **WHEN** init creates `qaspec/config.yaml` (or `openspec/config.yaml` per planning home) with `schema: qaspec-pr-review`
- **AND** no prior config file existed
- **THEN** the file contains a non-empty `context: |` block including QA role (read-only on application source), language declaration, and stack placeholders teams may edit
- **AND** the file contains `rules.analyze`, `rules.test-cases`, `rules.specs`, and `rules.apply` each with at least one active rule line
- **AND** `rules.apply` references the per-change TCMS target (`qaspec tcms set`/`show`), the propose-new-project default with a halt for the user choice, and the single confirmation halt, not prepare files or config-target writes
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

### Requirement: Seed rules encode pipeline hardening gates

The init seed for schema `qaspec-pr-review` SHALL encode the hardening contract in its phase rules: `rules.analyze` SHALL require the approval digest halt (Unvalidated assumptions, zero to three targeted questions, no fabricated question), recording approval via `qaspec approve analyze` after the user approves, and the ABSENT-intent guard; `rules.test-cases` SHALL require checking the approval state before drafting, a `req` annotation on every case, and a passing `qaspec validate cases` run before the halt; `rules.apply` SHALL require running `qaspec publish-gate` before the summary, citing the gate token with the user confirmation, write-ahead rows in `publish-log.md` with reconciliation on re-run, and omitting or defaulting unmapped Qase fields.

#### Scenario: Seeded analyze rules encode the digest halt and ledger

- **WHEN** `getQaspecPrReviewConfigSeed()` supplies `rules.analyze`
- **THEN** at least one active rule requires the approval digest with **Unvalidated assumptions** and at most three targeted questions
- **AND** at least one active rule requires running `qaspec approve analyze` after user approval
- **AND** at least one active rule forbids reconstructing intent from the diff when description and notes are absent

#### Scenario: Seeded test-cases rules encode traceability and validation

- **WHEN** `getQaspecPrReviewConfigSeed()` supplies `rules.test-cases`
- **THEN** at least one active rule requires verifying the analyze approval state before drafting
- **AND** at least one active rule requires a `req` annotation on every case
- **AND** at least one active rule requires a passing `qaspec validate cases` run before the approval halt

#### Scenario: Seeded apply rules encode the gate and write-ahead log

- **WHEN** `getQaspecPrReviewConfigSeed()` supplies `rules.apply`
- **THEN** at least one active rule requires `qaspec publish-gate` before the summary and the gate token with the confirmation
- **AND** at least one active rule requires pending rows in `publish-log.md` before the first MCP call and reconciliation on re-run
- **AND** at least one active rule forbids inferring unmapped Qase field values

#### Scenario: Seed validation still aligns with artifact ids

- **WHEN** the seed module is validated
- **THEN** the hardening rules live under the existing keys `analyze`, `test-cases`, and `apply`
- **AND** `qaspec instructions <id> --json` injects them without unknown-id warnings

