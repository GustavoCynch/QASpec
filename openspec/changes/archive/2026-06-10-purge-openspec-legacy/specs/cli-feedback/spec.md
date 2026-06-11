## MODIFIED Requirements

### Requirement: Feedback always works

The system SHALL allow feedback submission in any environment without depending on analytics or tracking state.

#### Scenario: Feedback works without any tracking state

- **WHEN** user runs `qaspec feedback "message"`
- **THEN** the feedback is submitted via `gh` CLI
- **AND** no usage analytics are sent

#### Scenario: Feedback in CI environment

- **WHEN** `CI=true` is set in the environment
- **AND** user runs `qaspec feedback "message"`
- **THEN** the feedback submission proceeds normally (if `gh` is available and authenticated)
