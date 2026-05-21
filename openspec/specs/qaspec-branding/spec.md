# qaspec-branding Specification

## Purpose
TBD - created by archiving change rebrand-openspec-to-qaspec. Update Purpose after archive.
## Requirements
### Requirement: Product naming matrix

QASpec SHALL use a consistent product naming matrix for all user-facing copy.

#### Scenario: Product name in prose

- **WHEN** documentation or CLI messages refer to this fork's product (not upstream)
- **THEN** the name SHALL be **QASpec** or **QA Spec**, not **OpenSpec**

#### Scenario: CLI command references

- **WHEN** instructing users to run the primary tool
- **THEN** messages SHALL reference the **`qaspec`** command (or document legacy **`openspec`** only as deprecated shim when shim exists)

#### Scenario: Upstream OpenSpec references

- **WHEN** describing detection of the original OpenSpec tool, coexistence, or migration from upstream artifacts
- **THEN** the text MAY use **OpenSpec** explicitly with qualifier **upstream** or **legacy**

#### Scenario: Lineage attribution

- **WHEN** README or docs mention project origin
- **THEN** a single lineage attribution to OpenSpec (openspec.dev) MAY remain
- **AND** the rest of the document SHALL not present OpenSpec as the name of this product

### Requirement: Branding regression guard

The repository SHALL include an automated check that prevents new inappropriate **OpenSpec** product strings in active product surfaces.

#### Scenario: Failing on mis-branded CLI source

- **WHEN** a contributor adds user-facing text containing `OpenSpec` under `src/` without an allowlisted pattern
- **THEN** the branding guard test SHALL fail

#### Scenario: Allowlisted upstream references

- **WHEN** source code contains `upstream OpenSpec`, marker-detection identifiers, or migration comments required for coexistence
- **THEN** the branding guard SHALL allow those matches

### Requirement: Fork project links

User-facing "learn more" and feedback links for this product SHALL target the QASpec fork repository, not the upstream OpenSpec default URLs.

#### Scenario: Init completion links

- **WHEN** `qaspec init` completes and displays documentation links
- **THEN** URLs SHALL point to this fork's GitHub (or published docs site), not `Fission-AI/OpenSpec` unless explicitly labeled as upstream lineage

