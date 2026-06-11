# qas-cases-validation Specification (delta)

## ADDED Requirements

### Requirement: Deterministic coverage validation

The CLI SHALL provide `qaspec validate cases --change <name>` that parses requirement and scenario headings from the change `specs/**/*.md` and `req` annotations from `testcases.md`, and fails listing every requirement with no covering case and every annotation that references a non-existent requirement. With `--json` the result SHALL be machine-readable.

#### Scenario: Uncovered requirement fails validation

- **GIVEN** a change delta spec contains a requirement with no case annotated to it
- **WHEN** `qaspec validate cases --change <name>` runs
- **THEN** the command exits non-zero
- **AND** the output names the uncovered `capability/requirement-slug`

#### Scenario: Dangling annotation fails validation

- **GIVEN** a case annotated `<!-- req: billing-export/totals -->` and no such requirement in the change specs
- **WHEN** validation runs
- **THEN** the command exits non-zero and names the dangling reference with its line number

#### Scenario: Full coverage passes

- **GIVEN** every requirement in the change delta specs has at least one annotated case and every annotation resolves
- **WHEN** validation runs
- **THEN** the command exits zero with a coverage summary per capability

#### Scenario: Scenario-level coverage reported as warning

- **WHEN** a requirement is covered but one of its scenarios has no dedicated case
- **THEN** validation reports a warning naming the scenario
- **AND** the command still exits zero when no requirement-level failures exist

### Requirement: Mandatory case traceability annotations

Every checkbox case in `testcases.md` SHALL carry a `<!-- req: ... -->` annotation whose value is a `capability/requirement-slug`, `assumption:<id>` for cases derived from an unvalidated assumption in `analysis.md`, or `gap` for cases written despite missing source detail. Validation SHALL fail naming any case line without an annotation.

#### Scenario: Unannotated case fails validation

- **GIVEN** a `- [ ]` case line with no `req` annotation
- **WHEN** validation runs
- **THEN** the command exits non-zero and names the case line

#### Scenario: Assumption-derived case is traceable

- **WHEN** a case is drafted from an entry in **Unvalidated assumptions**
- **THEN** its annotation is `assumption:<id>` matching that entry
- **AND** validation accepts it without requiring a spec requirement match

### Requirement: Case format validation

`qaspec validate cases` SHALL verify the checkbox grammar and the enriched case structure: each case is a single `- [ ]`/`- [x]` line under a `## Suite:` heading, followed by **Preconditions** and **Steps** blocks where each step row has an Action and an Expected column. Malformed structure SHALL fail with the offending line.

#### Scenario: Missing Steps block fails

- **GIVEN** a case checkbox line with no **Steps** block beneath it
- **WHEN** validation runs
- **THEN** the command exits non-zero naming the case

#### Scenario: Format drift detected before publish

- **GIVEN** a Steps table whose rows lack the Expected column
- **WHEN** validation runs
- **THEN** the failure names the case and the malformed row

### Requirement: Validation gates the cases halt

Cases-phase instructions for `qaspec-pr-review` SHALL require running `qaspec validate cases --change <name>` and reaching a passing result before presenting the approval halt, replacing prompt-only self-audit as the coverage check. The halt message SHALL include the validator's coverage summary.

#### Scenario: Halt forbidden until validation passes

- **WHEN** the agent finishes drafting `testcases.md` and validation fails
- **THEN** the agent fixes the reported issues and re-runs validation
- **AND** the approval halt is presented only after a passing run, including its summary
