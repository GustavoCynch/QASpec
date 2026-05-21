## ADDED Requirements

### Requirement: Coexistence prose clarity

Requirements and user-visible messages about coexistence SHALL name **upstream OpenSpec** and **QASpec** distinctly.

#### Scenario: Init blocked by upstream

- **WHEN** init refuses to modify a repo with active upstream OpenSpec
- **THEN** the message SHALL state that **upstream OpenSpec** is installed and QASpec will not overwrite it
