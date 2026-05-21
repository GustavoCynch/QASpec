## ADDED Requirements

### Requirement: Shared config injection preamble

Every generated `qas-analyze`, `qas-matrix`, `qas-publish`, and `qas-archive` skill and matching slash command SHALL include a shared preamble that requires the agent to run `qaspec status` and `qaspec instructions <artifact-id> --change "<name>" --json` before work, treat JSON `context` and `rules` as binding constraints, use JSON `instruction` and `template` as the artifact contract, and not copy `context` or `rules` into artifact files.

#### Scenario: Analyze skill cites instructions JSON contract

- **WHEN** init generates `qas-analyze` for Cursor
- **THEN** SKILL.md instructs running `qaspec instructions analyze --change "<name>" --json`
- **AND** states that `context` and `rules` from the response must be applied and must not be pasted into `analisis.md`

#### Scenario: Matrix skill loads two instruction sets

- **WHEN** init generates `qas-matrix`
- **THEN** instructions require `qaspec instructions test-matrix` and `qaspec instructions specs` JSON before writing outputs

### Requirement: Dual analyst orchestration in skills

Generated analyze and matrix skills SHALL document parallel blind Task delegations (two identical analyst prompts, synthesis by orchestrator only) and forbid skipping subagents when the Task tool is available.

#### Scenario: Analyze skill mentions dual Task

- **WHEN** `qas-analyze` is generated from bundled templates
- **THEN** the body includes parallel blind Task subagents for draft analysis
- **AND** includes analyst prompt expectations (each analyst fetches gh/git independently when a GitHub PR is in scope)

## MODIFIED Requirements

### Requirement: Analyze workflow behavior

The `qas-analyze` skill and `/qas:analyze` command SHALL produce `analisis.md` using the schema template and `qaspec instructions analyze` output, require reading `qaspec/references/historical_bugs.md` on every run, use dual blind analyst Task synthesis by default with Agreed / Single-analyst / Contradiction merge documented in the artifact, include **Affected capabilities** (kebab-case), cover functional intent vs implementation, framework/API/regression/responsive/localization/settings risks per project `rules.analyze` and schema instruction, SHALL NOT write `specs/**/*.md` or `testmatrix.md` in this step, and end with exactly one halt question.

#### Scenario: Analyze references path

- **WHEN** the agent runs analyze for a project initialized by QASpec
- **THEN** instructions point to `qaspec/references/historical_bugs.md` using path.join-safe resolution from project root

#### Scenario: Analyze does not write specs

- **WHEN** analyze completes with a halt
- **THEN** `analisis.md` exists with sections matching the enriched schema template (including synthesis notes when analysts disagreed)
- **AND** no new `specs/<capability>/spec.md` files are required from the analyze step alone

#### Scenario: Analyze uses config rules not skill locale

- **WHEN** project `rules.analyze` declares Spanish narrative requirements
- **THEN** the agent applies those rules from instructions JSON
- **AND** the English skill body does not hardcode Spanish halt text

### Requirement: Matrix workflow behavior

The `qas-matrix` skill and `/qas:matrix` command SHALL produce `testmatrix.md` with mandatory checkboxes, co-produce change delta specs under `specs/**/*.md`, read `qaspec/references/qase_test_case_rules.md`, read `qaspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md` when present, apply matrix-specific depth from `rules.test-matrix` and schema instructions (BVA, readable narrative, API blocking resilience, settings on/off, dual blind analyst merge for case lists), and halt once for human approval of **both** the case list and the requirements.

#### Scenario: Matrix format

- **WHEN** matrix output is written
- **THEN** each test case is a single `- [ ]` line with observable title text under a `##` suite heading

#### Scenario: Co-produced delta specs

- **WHEN** the agent completes a matrix phase turn before the halt
- **THEN** the change contains or updates at least one `specs/<capability>/spec.md` delta when the change introduces or modifies testable behavior
- **AND** requirements and scenarios stay aligned with cases in `testmatrix.md`

#### Scenario: Single halt for matrix and specs

- **WHEN** the matrix phase ends awaiting user approval
- **THEN** the agent asks exactly one question covering approval of the matrix and the specs together
- **AND** the agent does not start publish or Qase MCP in the same message

#### Scenario: Chat iteration updates both artifacts

- **WHEN** the user requests case or requirement changes after the initial matrix draft
- **THEN** the agent updates `testmatrix.md` and affected `specs/**/*.md` in the same conversation without requiring a separate slash command

### Requirement: Content migration from qa-pr-review

Workflow template bodies SHALL implement behavior from `.agents/skills/qa-pr-review/SKILL.md` by split responsibility: **project-owned** role, stack, domain, and locale in `qaspec/config.yaml` (`context` and `rules.<artifact-id>`); **fork-owned** orchestration (CLI steps, halts, file paths, dual Task protocol, guardrails) in `src/core/templates/workflows/`; **artifact contracts** in `schemas/qaspec-pr-review/`. Phase mapping remains 1→analyze, 2→matrix, 3+4→publish. The reference pack stays archive-only.

#### Scenario: Reference pack retained in fork

- **WHEN** a contributor clones the QASpec fork
- **THEN** path `.agents/skills/qa-pr-review/` MAY exist with SKILL.md and `references/`
- **AND** SKILL.md or README states the pack is reference-only and superseded by `/qas:analyze`, `/qas:matrix`, `/qas:publish`
- **AND** the skill is not auto-invoked as a product workflow (e.g. `disable-model-invocation: true` or equivalent)

#### Scenario: No duplicate QA pack in core init

- **WHEN** init completes on a fresh repo with the QASpec core profile
- **THEN** core init does not install `qa-pr-review` as a managed workflow skill
- **AND** QASpec QA behavior is available via `qas-*` only
- **AND** init scaffolds `qaspec/references/` from bundled seeds, not by copying `.agents/skills/qa-pr-review/references/`

#### Scenario: Fork dogfooding uses spec-driven agent commands

- **WHEN** maintainers work on the CLI in this repository
- **THEN** they MAY use committed `opsx-*` / `openspec-*` commands under `.cursor/` for `spec-driven` changes
- **AND** absence of committed `qas-*.md` under `.cursor/` does not indicate a product defect

#### Scenario: Init smoke validates enriched analyze skill

- **WHEN** verification runs after workflow template changes
- **THEN** temp-dir init output includes `qas-analyze` skill containing `instructions analyze` and `historical_bugs`
- **AND** temp-dir config includes active `rules.analyze`
