# artifact-language-policy Delta

## MODIFIED Requirements

### Requirement: Localized reference scaffolds on init

When init creates `qaspec/references/*.md` for the first time, the seed content SHALL match the project's configured language.
(Previously: named the case-rules scaffold `qase_test_case_rules.md`.)

#### Scenario: First init with Spanish context

- **WHEN** init creates config with Spanish declared in `context` (user prompt or existing config)
- **THEN** new `historical_bugs.md` and `tcms_case_rules.md` scaffolds are written in Spanish
- **AND** existing reference files are not overwritten

#### Scenario: English default

- **WHEN** no language is declared in config at init time
- **THEN** scaffolds default to English
- **AND** generated config includes a commented or explicit `Language: English` hint in `context` for the user to change
