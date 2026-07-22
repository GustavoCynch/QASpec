# cli-init Delta

## MODIFIED Requirements

### Requirement: QASpec reference scaffolding on init

The `qaspec init` command SHALL scaffold `qaspec/references/historical_bugs.md` and `qaspec/references/tcms_case_rules.md` when missing, without overwriting existing files.
(Previously: scaffolded `qaspec/references/qase_test_case_rules.md`.)

#### Scenario: References created on first init

- **WHEN** init completes successfully on a project without those files
- **THEN** both reference files, including `qaspec/references/tcms_case_rules.md`, exist under `qaspec/references/`
- **AND** existing reference files are unchanged on re-init
