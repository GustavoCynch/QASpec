# qaspec-init-references Delta

## MODIFIED Requirements

### Requirement: Reference paths in workflow instructions

Generated analyze, cases, and publish workflow instructions SHALL reference these paths relative to project root.

#### Scenario: Windows path safety

- **WHEN** instructions embed reference paths in generated skills
- **THEN** agents are told to resolve files from project root without hardcoded forward-slash-only assumptions
