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

### Requirement: Qase rules template

Init SHALL create `qaspec/references/qase_test_case_rules.md` only if that file does not exist.

#### Scenario: Seed Qase rules template

- **WHEN** the file is missing
- **THEN** init writes a dummy template describing suite layout, steps, and observable wording rules for Qase

### Requirement: Reference paths in workflow instructions

Generated `qas-analyze` and `qas-matrix` / `qas-publish` instructions SHALL reference these paths relative to project root.

#### Scenario: Windows path safety

- **WHEN** instructions embed reference paths in generated skills
- **THEN** agents are told to resolve files from project root without hardcoded forward-slash-only assumptions
