## MODIFIED Requirements

### Requirement: Prerequisites

The command SHALL require an existing QASpec planning home before allowing updates.

#### Scenario: Checking prerequisites

- **GIVEN** the command requires an existing planning directory (created by `qaspec init`)
- **WHEN** no QASpec planning home is found
- **THEN** display an error directing users to run **`qaspec init`**, without calling this product "OpenSpec"
- **AND** exit with code 1

### Requirement: Update Behavior

The update command SHALL update QASpec instruction files to the latest templates in a team-friendly manner.

#### Scenario: Running update command

- **WHEN** a user runs `qaspec update`
- **THEN** refresh planning-home agent instructions from the latest QASpec templates
- **AND** use QASpec branding in user-visible status output

## ADDED Requirements

### Requirement: Learn More Links

Update completion output SHALL link to the QASpec fork for documentation and feedback.

#### Scenario: Post-update documentation

- **WHEN** update flow prints documentation or feedback URLs for this product
- **THEN** links SHALL target the QASpec fork repository (or published QASpec docs), not default upstream OpenSpec URLs unless labeled as upstream lineage
