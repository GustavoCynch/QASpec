# artifact-language-policy Delta

## MODIFIED Requirements

### Requirement: Project language for generated QA content

Change artifacts and user-facing workflow output for a QA project SHALL use the language declared in that project's `openspec/config.yaml`.

#### Scenario: Instructions injection

- **WHEN** an agent runs `openspec instructions <artifact-id> --json` for a `qaspec-pr-review` change
- **THEN** the response includes `context` and artifact-specific `rules` from config
- **AND** QASpec workflow templates instruct the agent to write `analisis.md`, `testcases.md`, and related files in that language

#### Scenario: Halt and case-list text

- **WHEN** `/qsx:analyze` or `/qsx:cases` presents a halt question or case titles to a human tester
- **THEN** the text is in the project language from config
- **AND** is not forced to English or any fixed locale by hardcoded template text in `src/`

### Requirement: No mandatory locale in core templates

Core QASpec workflow templates SHALL NOT hardcode a customer locale (for example mandatory Spanish) in the fork.

#### Scenario: Migrating qa-pr-review

- **WHEN** content is ported from `qa-pr-review` into the analyze / cases / publish workflow templates
- **THEN** locale-specific rules (observable wording, halt language) are expressed as config `rules` examples or docs
- **AND** the shipped default templates only reference "project language from config"
