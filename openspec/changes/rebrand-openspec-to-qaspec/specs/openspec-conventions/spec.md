## MODIFIED Requirements

### Requirement: Structured conventions for specs and changes

QASpec conventions SHALL mandate a structured spec format with clear requirement and scenario sections so tooling can parse consistently.

#### Scenario: Following the structured spec format

- **WHEN** writing or updating QASpec specifications
- **THEN** authors SHALL use `### Requirement: ...` followed by at least one `#### Scenario: ...` section

### Requirement: Behavior-First Specification Boundary

QASpec specifications SHALL capture verifiable behavior contracts and avoid internal implementation detail.

#### Scenario: Writing behavior requirements

- **WHEN** documenting a capability in `spec.md`
- **THEN** requirements focus on externally observable behavior, interfaces, error handling, and constraints
- **AND** scenarios remain testable or explicitly verifiable

#### Scenario: Avoiding implementation leakage

- **WHEN** details involve concrete library choices, class/function structure, or execution mechanics
- **THEN** those details SHALL be documented in `design.md` or `tasks.md` instead of behavioral requirements

### Requirement: Progressive Rigor

QASpec conventions SHALL keep specs lightweight by default and scale rigor only when risk or coordination complexity demands it.

#### Scenario: Routine change specification

- **WHEN** a change is local and low-risk
- **THEN** authors use concise, behavior-first requirements with minimal ceremony

#### Scenario: High-risk or cross-boundary change specification

- **WHEN** a change is cross-team, cross-repo, API-contract breaking, migration-heavy, or security/privacy sensitive
- **THEN** authors increase detail and explicit validation expectations proportionally

### Requirement: Project Structure

A QASpec project SHALL maintain a consistent directory structure for specifications and changes under the resolved planning home.

#### Scenario: Initializing project structure

- **WHEN** a QASpec project is initialized (greenfield, after planning-home rename)
- **THEN** it SHALL use the canonical planning layout under `qaspec/` as defined by the planning-home capability
- **AND** legacy `openspec/` layouts remain valid when only the legacy directory exists
