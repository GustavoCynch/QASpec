# qas-config-seed Specification (delta)

## ADDED Requirements

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
