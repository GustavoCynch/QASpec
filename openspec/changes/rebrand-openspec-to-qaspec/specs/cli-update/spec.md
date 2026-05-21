## MODIFIED Requirements

### Requirement: Update Command Purpose

The `qaspec update` command SHALL refresh QASpec skills and commands for configured tools.

#### Scenario: Missing planning home

- **WHEN** no QASpec planning home is found
- **THEN** the error message SHALL direct users to run **`qaspec init`**, without calling this product "OpenSpec"

### Requirement: Learn More Links

#### Scenario: Post-update documentation

- **WHEN** update flow prints documentation or feedback URLs for this product
- **THEN** links SHALL target the QASpec fork repository (or published QASpec docs), not default upstream OpenSpec URLs unless labeled as upstream lineage
