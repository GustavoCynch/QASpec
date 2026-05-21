## MODIFIED Requirements

### Requirement: Config File Generation

The command SHALL create a QASpec config file with schema settings and, when the default schema is `qaspec-pr-review` on first creation, SHALL seed active QA `context` and per-artifact `rules` as defined by the `qas-config-seed` capability.

#### Scenario: Creating config.yaml

- **WHEN** initialization completes
- **AND** config.yaml does not exist
- **THEN** create planning-home `config.yaml` with default schema `qaspec-pr-review` when the QASpec product default applies
- **AND** the new file includes active QA `context` and `rules` for analyze, test-matrix, specs, and apply
- **AND** display config location in output

#### Scenario: Preserving existing config.yaml

- **WHEN** initialization runs in extend mode
- **AND** config.yaml already exists
- **THEN** preserve the existing config file
- **AND** display "(exists)" indicator in output
