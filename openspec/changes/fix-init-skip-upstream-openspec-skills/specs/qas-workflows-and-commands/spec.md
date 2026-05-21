## ADDED Requirements

### Requirement: Upstream OpenSpec workflow artifacts are not replaced

When upstream OpenSpec is active in a project, QASpec init and update SHALL install only the QASpec core (`qas-*`) workflow surface and SHALL leave upstream `openspec-*` skills and `opsx-*` commands unchanged.

#### Scenario: Core profile beside upstream OpenSpec

- **GIVEN** upstream OpenSpec is active with `openspec-propose` and `openspec-apply-change` skills already installed
- **WHEN** the user runs `qaspec init` with the QASpec core profile
- **THEN** `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, and `qas-archive` skills are created or updated
- **AND** `openspec-propose` and `openspec-apply-change` skill files are not modified by QASpec

#### Scenario: Custom profile with legacy OpenSpec workflows

- **GIVEN** upstream OpenSpec is active
- **WHEN** the user selects a custom profile that includes `propose`, `apply`, or other `openspec-*` workflow ids
- **THEN** QASpec still does not overwrite existing upstream `openspec-*` skills or `opsx-*` commands
- **AND** QASpec `qas-*` skills for enabled QASpec workflows are still installed
