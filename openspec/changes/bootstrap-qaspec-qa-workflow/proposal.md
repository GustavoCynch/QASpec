## Why

QASpec is a fork of OpenSpec aimed at **QA workflows**, but the product still ships the **developer** OPSX surface (`/opsx:*`, `spec-driven`, `qa-pr-review` as a parallel skill). The roadmap in `roadmap/11-proposed-workflow-phases.md` is agreed; without this change, users cannot run the three-phase PR-review cycle (`analyze` → `matrix` → `publish`) through the motor and agent commands.

## What Changes

- Add schema **`qaspec-pr-review`** with artifacts `analisis.md`, `testmatrix.md` (checkbox format), and publish phase tracking `testmatrix.md` via `publish.tracks`.
- Replace **core agent workflows** for the QASpec product profile: install `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, `qas-archive` and slash commands `/qas:*` instead of `propose` / `apply` / `opsx-*` for QA.
- Extend **`qaspec init`** (while directory may still be `openspec/` in this change) to scaffold `qaspec/references/historical_bugs.md` and `qaspec/references/qase_test_case_rules.md` without overwriting existing files.
- Migrate operational content from `.agents/skills/qa-pr-review/SKILL.md` into workflow templates under `src/core/templates/workflows/`.
- **Language policy:** all fork source code, CLI output, tests, and bundled skill/command templates in `src/` remain **English**; user-facing scaffold and generated QA artifacts (`analisis.md`, `testmatrix.md`, `qaspec/references/*`, halt prompts) follow the **project language** set in `openspec/config.yaml` (same mechanism as OpenSpec multi-language).
- **Out of scope for this change:** global CLI rename `openspec` → `qaspec`, renaming planning root to `qaspec/changes/`, Qase MCP implementation in the CLI, and deprecating `spec-driven` for internal dogfooding.

## Capabilities

### New Capabilities

- `qaspec-pr-review-schema`: Custom schema, templates, validation, and artifact graph for the QA PR-review cycle.
- `qas-workflows-and-commands`: Product core profile, skill/command templates (`qas-*`, `/qas:*`), and adapter path updates.
- `qaspec-init-references`: Reference file scaffolding during init (seed content in the user's configured language).
- `artifact-language-policy`: Separation of English implementation surface vs localized user templates and change artifacts.

### Modified Capabilities

- `cli-init`: Default schema for new projects, reference scaffolding, and success messaging for `/qas:*` workflows.
- `command-generation`: Cursor and other adapters emit `qas-<id>` paths and `/qas:<id>` command names for QASpec workflows.

## Impact

- `schemas/qaspec-pr-review/` (new)
- `src/core/profiles.ts`, `src/core/shared/skill-generation.ts`, `src/core/init.ts`
- `src/core/templates/workflows/` (new `analyze`, `matrix`, `publish`; adapt `explore`, `archive`)
- `src/core/command-generation/adapters/*`, `src/utils/command-references.ts`
- `src/core/legacy-cleanup.ts`, `src/ui/welcome-screen.ts`, tests under `test/`
- Generated samples: `.cursor/commands/qas-*.md`, `.cursor/skills/qas-*` (after init/update)
- Documentation: `roadmap/05-custom-schema-and-artifacts.md` alignment (no mandatory `intake`)
- **Deprecation path:** `.agents/skills/qa-pr-review/` documented as superseded; removal in a follow-up change after templates are verified
