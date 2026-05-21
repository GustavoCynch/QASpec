## MODIFIED Requirements

### Requirement: Update workflow artifact generation

`qaspec update` SHALL refresh only QASpec `qas-*` skills and `qas-*` / `/qas:*` commands for the active profile. It SHALL NOT generate or overwrite legacy `openspec-*` skills or `opsx-*` commands from QASpec templates. When upstream OpenSpec is active, update SHALL follow the same non-interference rules as init.

#### Scenario: Core profile update

- **WHEN** update runs with core profile and skills delivery enabled
- **THEN** `qas-publish` and sibling skills are updated
- **AND** no `openspec-propose` skill is written by QASpec

#### Scenario: Cleanup after update without upstream

- **WHEN** update runs and upstream OpenSpec is not active
- **AND** legacy `openspec-*` or `opsx-*` files from prior QASpec installs remain
- **THEN** update MAY remove them via the legacy cleanup path before regenerating QASpec artifacts
