# qaspec-branding Specification

## Purpose
Define consistent QASpec product naming in user-facing copy, CLI messages, and generated artifacts so the fork is clearly distinguished from upstream tooling.
## Requirements
### Requirement: Product naming matrix

QASpec SHALL use a consistent product naming matrix for all user-facing copy.

#### Scenario: Product name in prose

- **WHEN** documentation or CLI messages refer to this fork's product (not upstream)
- **THEN** the name SHALL be **QASpec** or **QA Spec**, not **OpenSpec**

#### Scenario: CLI command references

- **WHEN** instructing users to run the primary tool
- **THEN** messages SHALL reference only the **`qaspec`** command

#### Scenario: Agent slash command references

- **WHEN** documentation instructs users to run the default installed agent workflow
- **THEN** it SHALL reference **`/qsx:*`** slash commands only

#### Scenario: Repository spec history paths

- **WHEN** maintainer or internal docs reference the in-repo specification tree
- **THEN** they MAY use the literal path segment `openspec/specs/` or `openspec/changes/` as a **directory name**
- **AND** prose SHALL NOT describe that directory as "the OpenSpec product"

#### Scenario: Lineage attribution

- **WHEN** README mentions project origin
- **THEN** at most one short lineage attribution to upstream may remain
- **AND** the rest of the document SHALL present QASpec as the product

### Requirement: Branding regression guard

The repository SHALL include automated checks that prevent new inappropriate **OpenSpec** product strings and `openspec <subcommand>` examples in guarded surfaces. The allowlist SHALL be limited to lineage attribution, this repository's own planning-home directory paths, and historical records (CHANGELOG, archived changes).

#### Scenario: Failing on mis-branded docs

- **WHEN** a contributor adds user-facing text containing unallowlisted `OpenSpec` under `docs/`
- **THEN** the branding guard test SHALL fail

#### Scenario: Failing on openspec CLI examples in docs

- **WHEN** a contributor adds `openspec init` to `docs/cli.md`
- **THEN** the documentation command guard SHALL fail

#### Scenario: Allowlist covers lineage and history only

- **WHEN** the branding guard evaluates an `OpenSpec` match
- **THEN** it SHALL pass only for the README lineage attribution, literal `openspec/` path segments referring to this repository's planning home, or historical records
- **AND** migration- or coexistence-related allowlist entries no longer exist

### Requirement: Fork project links

User-facing "learn more" and feedback links for this product SHALL target the QASpec fork repository, not the upstream OpenSpec default URLs.

#### Scenario: Init completion links

- **WHEN** `qaspec init` completes and displays documentation links
- **THEN** URLs SHALL point to this fork's GitHub (or published docs site), not `Fission-AI/OpenSpec` unless explicitly labeled as upstream lineage

