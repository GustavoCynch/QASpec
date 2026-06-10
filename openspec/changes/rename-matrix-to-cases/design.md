# Design: Rename Matrix to Cases

## Context

The matrix phase is wired by name across four layers:

1. **Workflow id** `matrix` — `CORE_WORKFLOWS` (`src/core/profiles.ts`), skill/command registry (`src/core/shared/skill-generation.ts`), drift map (`profile-sync-drift.ts`), tool detection (`tool-detection.ts`), workflow descriptions (`commands/config.ts`).
2. **Schema artifact id** `test-matrix` and file `testmatrix.md` — `schemas/qaspec-pr-review/schema.yaml` (artifact + `apply.tracks`), template `templates/testmatrix.md`, cross-references inside the `analyze`, `specs`, and apply instructions.
3. **Config keys** — `rules.test-matrix` (injected by artifact id) and `workflow.multipleSubagents.matrix` (`project-config.ts`, `subagent-mode.ts`, `qa-config-seed.ts`).
4. **Skill bodies and docs** — `matrix.ts` template, preamble constants (`QAS_MATRIX_ANALISIS_AUTHORITY`), analyze/publish/archive bodies, docs, website.

Precedents established by `remove-explore-step`: retired ids are filtered at resolution with a notice (`RETIRED_QAS_WORKFLOW_IDS`), and stale skill dirs/command files are cleaned by the deselected-workflow cleanup (`removeUnselectedSkillDirs` + retired-dir removal in `upstream-coexistence.ts`).

## Goals / Non-Goals

**Goals:**

- One vocabulary everywhere: workflow `cases`, command `/qsx:cases`, skill `qaspec-cases`, artifact `test-cases`, file `testcases.md`.
- Existing user projects survive the rename without manual edits: legacy config keys are honored, in-flight `testmatrix.md` changes still track and publish.
- Stale `qaspec-matrix` / `qsx-matrix` files are removed on init/update.

**Non-Goals:**

- Changing what the phase does (co-produced delta specs, halts, subagent modes stay identical).
- Publish flow redesign, `analisis.md` rename, `/qas:` prefix cleanup (other proposals).
- Renaming `qase_test_case_rules.md` or other reference seeds (already case-named).

## Decisions

### D1: Rename map, not retirement, for the workflow id

Add `RENAMED_QAS_WORKFLOW_IDS: Record<string, string> = { matrix: 'cases' }` beside `RETIRED_QAS_WORKFLOW_IDS` in `profiles.ts`. Workflow resolution maps legacy ids to their new name (deduplicated) with a one-line notice, instead of dropping them. A custom profile listing `matrix` keeps getting the phase — under its new name.

*Alternative considered*: treating `matrix` as retired and requiring users to add `cases` manually. Rejected — the phase still exists; dropping it would silently remove the core of the QA pipeline from custom profiles.

### D2: Schema artifact id changes; tracking gets a legacy-file fallback

`schema.yaml` renames artifact `test-matrix` → `test-cases`, `generates`/`tracks` → `testcases.md`, template file renamed. Because changes reference schemas by name (no snapshot), in-flight changes resolve the new schema immediately. To avoid breaking them, the tracking/progress layer (instruction loader + status) falls back to `testmatrix.md` when `tracks` resolves to a missing `testcases.md` but the legacy file exists, emitting a notice suggesting `git mv testmatrix.md testcases.md`. The fallback is read-only compatibility; new writes always use `testcases.md`.

*Alternative considered*: schema version bump with per-change pinning. Rejected — the codebase has no schema-snapshot mechanism today; building one for a rename is disproportionate.

### D3: Config keys rename with read-time aliases

- `rules.test-cases` is the canonical key; when absent and `rules.test-matrix` exists, instruction loading injects the legacy key's rules and notes the rename once. Seed (`qa-config-seed.ts`) writes only `test-cases`.
- `workflow.multipleSubagents.cases` is canonical; `project-config.ts` parsing accepts legacy `matrix` (canonical wins when both present) and `subagent-mode.ts` reads the resolved value. Seed writes `cases: false`.

*Alternative considered*: a one-time config file migration that rewrites user YAML. Rejected — QASpec avoids rewriting user-edited config (comments/footers would be lost); read-time aliasing matches how `.openspec-workspace` → `.qaspec-workspace` was handled.

### D4: File renames preserve history; constants renamed for vocabulary

`git mv` for `matrix.ts` → `cases.ts` and `templates/testmatrix.md` → `templates/testcases.md`. Exported symbols rename (`getQasMatrixSkillTemplate` → `getQasCasesSkillTemplate`, `QAS_MATRIX_ANALISIS_AUTHORITY` → `QAS_CASES_ANALISIS_AUTHORITY`); no deprecated re-exports — all importers are in-repo.

### D5: Stale file cleanup reuses the deselected mechanism

With `matrix` gone from desired workflows, `removeUnselectedSkillDirs` and the command-file equivalent delete `qaspec-matrix` dirs and `qsx-matrix.md` / `qsx/matrix.md` files, under the existing `upstreamOpenSpecActive` guard. Add `qaspec-matrix` to the retired-dir list used by `upstream-coexistence.ts` only if a test proves some init path misses it (same fallback posture as remove-explore-step D3).

## Risks / Trade-offs

- [In-flight cycle publishes from legacy file] → D2 fallback covers tracking and publish reads; test with a fixture change containing only `testmatrix.md`.
- [User config has both legacy and new keys] → canonical key wins, notice printed once; covered by config-loading test.
- [Docs/tests sweep misses a `matrix` mention] → final task runs `rg -i "matrix"` over `src/ docs/ schemas/ website/ test/` and triages every hit (the word also appears legitimately, e.g. `qaspec-branding`'s "Product naming matrix" — requirement about naming consistency, not this phase).
- [Muscle memory: users type `/qsx:matrix`] → command is gone after update; migration notice in update output mentions the rename once.

## Migration Plan

1. Single release: rename + aliases + cleanup ship together; `qaspec update` self-heals generated files.
2. User action needed only for in-flight changes (optional `git mv testmatrix.md testcases.md`; otherwise fallback carries them to archive).
3. Rollback: revert the commit; legacy aliases are additive and carry no data migration.

## Open Questions

(none)
