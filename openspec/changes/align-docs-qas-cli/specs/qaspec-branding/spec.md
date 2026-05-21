## ADDED Requirements

### Requirement: Documentation slash-command branding

User-facing documentation under `docs/` (excluding allowlisted legacy pages) SHALL use **`/qas:`** as the slash-command prefix for QASpec-installed workflows and SHALL NOT present **`/opsx:`** commands as the primary product interface.

#### Scenario: Default command examples

- **WHEN** documentation shows example invocations for the core profile
- **THEN** examples SHALL use `/qas:analyze`, `/qas:matrix`, or other `/qas:*` forms
- **AND** SHALL NOT use `/opsx:propose` or `/opsx:apply` without a legacy qualifier in the same section

#### Scenario: README quick start

- **WHEN** the root `README.md` describes the first commands after install
- **THEN** it SHALL match the `/qas:*` default path documented in `docs/getting-started.md`

## MODIFIED Requirements

### Requirement: Product naming matrix

QASpec SHALL use a consistent product naming matrix for all user-facing copy.

#### Scenario: Product name in prose

- **WHEN** documentation or CLI messages refer to this fork's product (not upstream)
- **THEN** the name SHALL be **QASpec** or **QA Spec**, not **OpenSpec**

#### Scenario: CLI command references

- **WHEN** instructing users to run the primary tool
- **THEN** messages SHALL reference the **`qaspec`** command (or document legacy **`openspec`** only as deprecated shim when shim exists)

#### Scenario: Agent slash command references

- **WHEN** documentation instructs users to run the default installed agent workflow
- **THEN** it SHALL reference **`/qas:*`** commands
- **AND** **`/opsx:*`** SHALL appear only in sections explicitly labeled legacy, upstream, or maintainer-only

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

#### Scenario: Documentation slash-command guard

- **WHEN** a contributor adds `/opsx:` to primary product documentation as the default install path
- **THEN** the documentation regression guard SHALL fail unless the file is allowlisted for legacy content
