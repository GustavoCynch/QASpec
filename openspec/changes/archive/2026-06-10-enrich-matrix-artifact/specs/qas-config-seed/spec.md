## ADDED Requirements

### Requirement: Test-matrix seed rules require enriched case bodies

The init seed for `rules.test-matrix` SHALL instruct agents to write preconditions and steps under each checkbox case, built from sources in hand, with generic steps only when sources lack actionable detail.

#### Scenario: Seeded test-matrix rules mention enriched format

- **WHEN** `getQaspecPrReviewConfigSeed()` supplies `rules.test-matrix`
- **THEN** at least one active rule requires **Preconditions** and **Steps** blocks per case in `testmatrix.md`
- **AND** at least one active rule forbids inventing vague flows when concrete UI or requirement detail exists in sources
- **AND** rules remain keyed as `test-matrix` for instruction injection
