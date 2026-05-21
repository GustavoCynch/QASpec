## MODIFIED Requirements

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
