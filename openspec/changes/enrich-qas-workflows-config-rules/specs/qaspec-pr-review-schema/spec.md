## MODIFIED Requirements

### Requirement: Analyze artifact

The schema SHALL define artifact `analyze` that generates `analisis.md` with no upstream dependencies, an enriched sectioned template, and instruction text that requires dual blind analysts, historical bug patterns, dual source of truth, and synthesis notes—while deferring test-case and delta-spec authoring to later artifacts.

#### Scenario: First artifact in a new change

- **WHEN** a user creates a change with schema `qaspec-pr-review`
- **THEN** `analyze` is available as the first ready artifact
- **AND** `qaspec instructions analyze` resolves output to `analisis.md` under the change directory

#### Scenario: Affected capabilities seed specs

- **WHEN** `analisis.md` is created
- **THEN** the artifact includes an **Affected capabilities** section with kebab-case capability names
- **AND** instructions state that delta specs are not written in the analyze step

#### Scenario: Enriched analisis template sections

- **WHEN** an agent loads analyze instructions
- **THEN** the bundled `templates/analisis.md` includes sections for functional impact, framework/UI risks, backend/API risks, settings and feature flags, regression signals, responsive and usability, localization, security and data handling, risks for matrix phase, synthesis notes, and exactly one open question
- **AND** narrative fill language follows project config, not hardcoded locale in the template file
