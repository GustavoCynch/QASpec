# qaspec-init-references Specification (delta)

## MODIFIED Requirements

### Requirement: Qase rules template

Init SHALL create `qaspec/references/qase_test_case_rules.md` only if that file does not exist. The seeded template SHALL be structured around a closed field mapping table (Qase field → source in `testcases.md` → default → allowed values) and SHALL state that fields absent from the table are omitted or sent with the documented default, never inferred.

#### Scenario: Seed Qase rules template

- **WHEN** the file is missing
- **THEN** init writes a template describing suite layout, steps, and observable wording rules for Qase
- **AND** the template contains a field mapping table with columns for Qase field, source, default, and allowed values, including placeholder rows teams replace with their field codes

#### Scenario: Omit-on-unmapped rule is seeded

- **WHEN** the seeded template is read during the publish phase
- **THEN** it instructs that any Qase field without a mapping entry is omitted or defaulted
- **AND** it states that severity, priority, and type values are never invented

#### Scenario: Preserve user content

- **WHEN** `qase_test_case_rules.md` already exists
- **THEN** init does not modify the file
- **AND** init still succeeds
