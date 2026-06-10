# artifact-language-policy Delta

## MODIFIED Requirements

### Requirement: Project language for generated QA content

Change artifacts and user-facing workflow output for a QA project SHALL use the language declared in that project's `openspec/config.yaml`.

#### Scenario: Instructions injection

- **WHEN** an agent runs `openspec instructions <artifact-id> --json` for a `qaspec-pr-review` change
- **THEN** the response includes `context` and artifact-specific `rules` from config
- **AND** QASpec workflow templates instruct the agent to write `analysis.md`, `testcases.md`, and related files in that language

#### Scenario: Halt and case-list text

- **WHEN** `/qsx:analyze` or `/qsx:cases` presents a halt question or case titles to a human tester
- **THEN** the text is in the project language from config
- **AND** is not forced to English or any fixed locale by hardcoded template text in `src/`
