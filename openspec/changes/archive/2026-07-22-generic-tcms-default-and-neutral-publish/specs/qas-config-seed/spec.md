# qas-config-seed Delta

## MODIFIED Requirements

### Requirement: Seed documents the tcms target block

When init creates a new project config with schema `qaspec-pr-review`, the seed SHALL include a commented `tcms` example block documenting `provider`, `project`, and `baseUrl` in a provider-neutral form that OMITS a concrete `provider` value (no vendor-specific provider, no vendor-specific `baseUrl`). The comment SHALL explain that the block holds optional user-managed defaults, that absence of a `provider` is the generic default which leaves the target unusable until set, that the publish target lives per change in the change's `.qaspec.yaml` (set via `qaspec tcms set`), and that publish never writes this block.
(Previously: the commented example hardcoded a vendor-specific provider value and base URL, nudging new projects toward one specific TCMS product.)

#### Scenario: Fresh init includes commented tcms example

- **WHEN** init creates `qaspec/config.yaml` with `schema: qaspec-pr-review` and no prior config existed
- **THEN** the file contains a commented `tcms` block showing `provider`, `project`, and `baseUrl` keys with provider-neutral placeholders
- **AND** a comment states the block is user-managed defaults only and the per-change target is persisted via `qaspec tcms set`, never by publish writing this file

#### Scenario: Seeded tcms example is provider-neutral and provider-absent

- **WHEN** `getQaspecPrReviewConfigSeed()` supplies the commented `tcms` example block
- **THEN** the block does NOT contain a concrete `provider` value or a vendor-specific base URL example
- **AND** the comment documents that omitting `provider` is the generic default and that a concrete target is chosen per change, not in `config.yaml`

#### Scenario: Existing config is not overwritten

- **WHEN** init runs in extend mode and config already exists
- **THEN** the CLI does not add or replace a `tcms` block

### Requirement: Seed rules encode pipeline hardening gates

The init seed for schema `qaspec-pr-review` SHALL encode the hardening contract in its phase rules: `rules.analyze` SHALL require the approval digest halt (Unvalidated assumptions, zero to three targeted questions, no fabricated question), recording approval via `qaspec approve analyze` after the user approves, and the ABSENT-intent guard; `rules.test-cases` SHALL require checking the approval state before drafting, a `req` annotation on every case, and a passing `qaspec validate cases` run before the halt; `rules.apply` SHALL require running `qaspec publish-gate` before the summary, citing the gate token with the user confirmation, marking each published case `- [x]` in `testcases.md` after its successful create call with title-based reconciliation against the TCMS before creating on re-run, and omitting or defaulting unmapped TCMS fields. Seeded publish wording SHALL be provider-neutral and MCP-only, with no vendor-specific MCP-call naming, field naming, or publish-target phrasing; MCP tool names MAY appear only as illustrative examples. No seeded rule SHALL reference `publish-log.md`.
(Previously: seeded apply rules referenced a specific vendor's MCP call, fields, payloads, and IDs by name.)

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

#### Scenario: Seeded apply rules encode the gate and checkbox tracking

- **WHEN** `getQaspecPrReviewConfigSeed()` supplies `rules.apply`
- **THEN** at least one active rule requires `qaspec publish-gate` before the summary and the gate token with the confirmation
- **AND** at least one active rule requires marking each published case `- [x]` in `testcases.md` and reconciling unchecked cases against the TCMS by title before creating on re-run
- **AND** at least one active rule forbids inferring unmapped TCMS field values
- **AND** no rule references `publish-log.md`

#### Scenario: Seeded apply rules are provider-neutral

- **WHEN** `getQaspecPrReviewConfigSeed()` supplies `rules.apply`
- **THEN** no active rule names a specific TCMS product in its MCP-call, field, payload, or publish-target wording
- **AND** any MCP tool name that appears is framed as an illustrative example, not a required provider

#### Scenario: Seed validation still aligns with artifact ids

- **WHEN** the seed module is validated
- **THEN** the hardening rules live under the existing keys `analyze`, `test-cases`, and `apply`
- **AND** `qaspec instructions <id> --json` injects them without unknown-id warnings
