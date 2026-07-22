# qaspec-init-references Specification

## Purpose

Ensure every QASpec-initialized project has editable reference files for regression patterns and Qase authoring rules.
## Requirements
### Requirement: Reference directory scaffolding

On init, the system SHALL create `qaspec/references/` when it does not exist.

#### Scenario: First init on empty project

- **WHEN** init runs and `qaspec/references/` is absent
- **THEN** the directory is created under the project root using cross-platform path APIs

### Requirement: Historical bugs template

Init SHALL create `qaspec/references/historical_bugs.md` only if that file does not exist.

#### Scenario: Preserve user content

- **WHEN** `historical_bugs.md` already exists
- **THEN** init does not modify the file
- **AND** init still succeeds

#### Scenario: Seed template

- **WHEN** the file is missing
- **THEN** init writes a dummy template with guidance for documenting regression patterns

### Requirement: TCMS case rules template

Init SHALL create `qaspec/references/tcms_case_rules.md` only if that file does not exist. The seeded template SHALL be provider-agnostic: a neutral title referring to a TCMS (not a single provider), and a conceptual field-mapping table that maps the core case fields — title, description/preconditions, steps as action + expected result, and suite — to their source in `testcases.md`. The template SHALL state that any field without a mapping entry is omitted or sent with the documented default, never inferred. The template SHALL include a **Customize** section presented as the per-team / per-provider extension point where teams add their concrete provider field codes. The template SHALL preserve suite structure, the `- [ ] N.N` checkbox format, Preconditions, the Steps table, and `<!-- req: -->` traceability guidance.

#### Scenario: Seed TCMS case rules template

- **WHEN** the file is missing
- **THEN** init writes `tcms_case_rules.md` describing suite layout, steps, and observable wording rules in provider-neutral terms
- **AND** the template contains a conceptual field-mapping table for title, description/preconditions, steps (action + expected), and suite

#### Scenario: Field mapping table is provider-agnostic

- **WHEN** the seeded template's mapping table is read
- **THEN** its rows describe conceptual case fields mapped to their source in `testcases.md`, not codes named after a single provider

#### Scenario: Omit-on-unmapped rule is seeded

- **WHEN** the seeded template is read during the publish phase
- **THEN** it instructs that any field without a mapping entry is omitted or sent with the documented default
- **AND** it states that severity, priority, and type values are never invented

#### Scenario: Customize section is the provider extension point

- **WHEN** a team opens the seeded template's **Customize** section
- **THEN** it presents the section as where teams plug in their concrete provider field codes

#### Scenario: Preserve user content

- **WHEN** `tcms_case_rules.md` already exists
- **THEN** init does not modify the file
- **AND** init still succeeds

### Requirement: Legacy case-rules file migration

Projects containing a legacy `qaspec/references/qase_test_case_rules.md` SHALL receive a one-time, content-preserving rename to `qaspec/references/tcms_case_rules.md`. The migration SHALL rename only when the new file is absent; when both files exist it SHALL leave both untouched; it SHALL NEVER overwrite or delete user content. Path handling SHALL use cross-platform path APIs.

#### Scenario: Legacy file renamed when new name absent

- **GIVEN** `qaspec/references/qase_test_case_rules.md` exists and `tcms_case_rules.md` does not
- **WHEN** the migration runs
- **THEN** the file is renamed to `qaspec/references/tcms_case_rules.md` with its content unchanged

#### Scenario: Both files present are left untouched

- **GIVEN** both `qase_test_case_rules.md` and `tcms_case_rules.md` exist
- **WHEN** the migration runs
- **THEN** both files are left unchanged
- **AND** neither file is overwritten or deleted

#### Scenario: User customizations survive migration

- **GIVEN** a legacy `qase_test_case_rules.md` edited with custom provider field codes
- **WHEN** the migration renames it to `tcms_case_rules.md`
- **THEN** the resulting file contains the user's edits byte-for-byte

#### Scenario: No legacy file means nothing to migrate

- **GIVEN** no `qase_test_case_rules.md` exists
- **WHEN** the migration runs
- **THEN** no rename occurs and the operation succeeds

### Requirement: Reference paths in workflow instructions

Generated analyze, cases, and publish workflow instructions SHALL reference these paths relative to project root.

#### Scenario: Windows path safety

- **WHEN** instructions embed reference paths in generated skills
- **THEN** agents are told to resolve files from project root without hardcoded forward-slash-only assumptions

