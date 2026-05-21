## MODIFIED Requirements

### Requirement: User-visible cleanup messaging

Legacy cleanup SHALL distinguish **QASpec** artifacts from **upstream OpenSpec** in messages shown to users.

#### Scenario: Reporting upstream coexistence

- **WHEN** cleanup or init detects an active upstream OpenSpec install
- **THEN** user-facing text SHALL say **upstream OpenSpec** (not imply QASpec is OpenSpec)

#### Scenario: Reporting QASpec legacy artifacts

- **WHEN** cleanup removes QASpec-managed legacy paths
- **THEN** messages SHALL refer to **QASpec** or **legacy QASpec** artifacts, not "OpenSpec" alone as this product's name
