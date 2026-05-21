## Why

QASpec `qas-*` workflow skills and slash commands are minimal checklists (~20 lines each) while the archived `.agents/skills/qa-pr-review/SKILL.md` (~560 lines) still holds the real QA depth (dual blind analysts, analysis checklists, matrix rules, synthesis). The product spec already requires deriving workflow bodies from `qa-pr-review`, but that migration is incomplete—teams get halts and file paths without rigorous analysis behavior.

Centralizing **project-owned** role, stack, domain, and locale in `qaspec/config.yaml` (`context` + per-artifact `rules`) matches the existing instruction-loader design and avoids duplicating Cynch/Angular assumptions in every generated skill on `update`. Init must ship **active** (not commented-only) QA rule seeds for `qaspec-pr-review` so new projects are usable on day one.

## What Changes

- **Thin orchestrator skills** for all five core workflows (`qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, `qas-archive`): shared preamble (mandatory `qaspec instructions <id> --json`, apply `context`/`rules`, do not copy into artifacts), phase-specific steps, Cursor mechanics (parallel Task where required), guardrails.
- **Enriched `qaspec-pr-review` schema**: expanded `analisis.md` / `testmatrix.md` templates and `analyze` / `test-matrix` / `apply` artifact instructions aligned with Phase 1–4 of `qa-pr-review` (analyze depth; matrix case rules stay in matrix phase).
- **Init config seed** for `schema: qaspec-pr-review`: active `context` (QA role, read-only, language placeholder) and `rules` for artifact ids `analyze`, `test-matrix`, `specs`, `apply` ported from `qa-pr-review` (English in fork; teams edit locale/stack).
- **Shared workflow preamble module** in `src/core/templates/workflows/` to DRY the common block across five skill/command templates.
- **Documentation**: `docs/multi-language.md` and `docs/customization.md` — map `context` vs `rules` vs `qaspec/references/`.
- **Tests**: init/update smoke asserts seeded rules and skill markers (`instructions --json`, dual analysts, `historical_bugs`).

No **BREAKING** CLI flags. Existing consumer projects keep their config; `update` refreshes generated skills/commands only (config is not overwritten).

## Capabilities

### New Capabilities

- `qas-config-seed`: Opinionated `qaspec/config.yaml` scaffold for `qaspec-pr-review` including active QA `context` and per-artifact `rules` on first init.

### Modified Capabilities

- `qas-workflows-and-commands`: Enriched skill/command bodies; mandatory config injection contract; fulfillment of `qa-pr-review` content migration requirement.
- `qaspec-pr-review-schema`: Richer artifact templates and schema `instruction` text for analyze and test-matrix.
- `cli-init`: Init writes active QA config seed when default schema is `qaspec-pr-review`.
- `artifact-language-policy`: Init seed rules are active defaults; skills reference config as sole locale/role source (no hardcoded Spanish in `src/`).

## Impact

- `src/core/templates/workflows/*.ts` (analyze, matrix, publish, qas-explore, qas-archive + new shared preamble)
- `src/core/config-prompts.ts` (or dedicated seed builder)
- `schemas/qaspec-pr-review/schema.yaml`, `schemas/qaspec-pr-review/templates/*.md`
- `docs/multi-language.md`, `docs/customization.md`
- `test/core/init.test.ts`, `test/core/shared/skill-generation.test.ts`, `test/core/update.test.ts`
- Reference pack `.agents/skills/qa-pr-review/` unchanged (reference-only); product behavior moves to config + generated skills
