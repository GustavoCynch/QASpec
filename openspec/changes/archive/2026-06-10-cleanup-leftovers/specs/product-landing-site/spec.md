# product-landing-site Delta

## MODIFIED Requirements

### Requirement: QASpec-branded public copy

All visible marketing copy on the landing page SHALL use **QASpec** as the product name, **`qaspec`** as the CLI name, and **`/qsx:*`** as the default agent command prefix. The page SHALL NOT present **`/opsx:*`** or **`openspec`** as the primary user interface.

#### Scenario: No legacy command as default CTA

- **WHEN** a visitor reads workflow examples on the landing page
- **THEN** examples reference `/qsx:analyze`, `/qsx:cases`, `/qsx:publish`, or `/qsx:archive` as appropriate
- **AND** no example references a `/qas:*` or `matrix` command
- **AND** no section titles OpenSpec or OPSX as the product being installed

#### Scenario: Upstream attribution is secondary

- **WHEN** the page mentions OpenSpec
- **THEN** it is limited to a short "inspired by" or lineage note
- **AND** it does not imply the visitor is installing OpenSpec
