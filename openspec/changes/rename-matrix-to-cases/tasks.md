# Tasks: Rename Matrix to Cases

## 1. Workflow id and registries

- [ ] 1.1 In `src/core/profiles.ts`: change `matrix` to `cases` in `CORE_WORKFLOWS`; add `RENAMED_QAS_WORKFLOW_IDS = { matrix: 'cases' }`
- [ ] 1.2 Implement rename mapping in workflow resolution: legacy `matrix` maps to `cases` with a one-line notice, deduplicated when both ids are listed; generation exits 0
- [ ] 1.3 `git mv src/core/templates/workflows/matrix.ts src/core/templates/workflows/cases.ts`; rename exports to `getQasCasesSkillTemplate` / `getQasCasesCommandTemplate`; skill name `qaspec-cases`, command id `cases`, body text says "cases" phase and `/qsx:cases`
- [ ] 1.4 Update registry entries in `src/core/shared/skill-generation.ts` (workflowId `cases`, dirName `qaspec-cases`), re-exports in `skill-templates.ts`, `qaspec-cases` in `tool-detection.ts`, `cases` mapping in `profile-sync-drift.ts`, and workflow description in `commands/config.ts`
- [ ] 1.5 Rename preamble constants and helpers in `qas-workflow-preamble.ts` (`QAS_MATRIX_ANALISIS_AUTHORITY` → `QAS_CASES_ANALISIS_AUTHORITY`, subagent section/analyst block phase `'matrix'` → `'cases'`) and update importers (`cases.ts`, `analyze.ts`, `publish.ts`, `qas-archive.ts`, `subagent-mode.ts`)

## 2. Schema and templates

- [ ] 2.1 In `schemas/qaspec-pr-review/schema.yaml`: artifact id `test-matrix` → `test-cases`, `generates`/`apply.tracks` → `testcases.md`, update instruction texts (`/qsx:cases`, `testcases.md`, `rules.test-cases`, `multipleSubagents.cases`)
- [ ] 2.2 `git mv schemas/qaspec-pr-review/templates/testmatrix.md schemas/qaspec-pr-review/templates/testcases.md`; update `testmatrix.md` mentions inside `publish-plan.md`, `publish-log.md`, and `analisis.md` templates
- [ ] 2.3 Implement legacy tracking fallback: when `tracks` resolves to a missing `testcases.md` but `testmatrix.md` exists in the change dir, status/progress and publish read `testmatrix.md` with a notice suggesting `git mv testmatrix.md testcases.md`

## 3. Config keys

- [ ] 3.1 In `src/core/project-config.ts`: parse `workflow.multipleSubagents.cases`; accept legacy `matrix` key as alias (canonical wins when both present) with a rename notice
- [ ] 3.2 In `src/core/qa-config-seed.ts`: seed `multipleSubagents.cases: false` and rules keyed `test-cases`; update rule texts referencing testmatrix/matrix phase
- [ ] 3.3 Instruction loading injects `rules.test-matrix` as `rules.test-cases` when the new key is absent, with a one-time notice; `subagent-mode.ts` reads the resolved `cases` flag

## 4. User-facing surfaces

- [ ] 4.1 Update `src/ui/welcome-screen.ts`, `src/core/init.ts`, `src/core/update.ts`, and `src/core/migration.ts` hints from `/qsx:matrix` to `/qsx:cases`; update `reference-scaffold.ts` mentions of testmatrix
- [ ] 4.2 Verify stale-file cleanup: update removes `qaspec-matrix` skill dirs and `qsx-matrix.md` / `qsx/matrix.md` command files (deselected mechanism); extend the retired/renamed dir list in `upstream-coexistence.ts` only if a test shows a missed path
- [ ] 4.3 Update docs (`workflows.md`, `commands.md`, `getting-started.md`, `concepts.md`, `cli.md`, `multi-language.md`, `customization.md`, `README.md`): pipeline `analyze → cases → publish → archive`, artifact `testcases.md`, config keys `rules.test-cases` / `multipleSubagents.cases` with legacy-alias note
- [ ] 4.4 Update `website/src/` step names, command chips, and artifact mentions from matrix/testmatrix to cases/testcases

## 5. Tests and verification

- [ ] 5.1 Update all suites referencing `matrix`, `test-matrix`, `testmatrix.md`, `qaspec-matrix`, `/qsx:matrix`, or `multipleSubagents.matrix` to the new names
- [ ] 5.2 Add test: config with legacy `multipleSubagents.matrix: true` resolves `cases: true` with notice; both keys present → canonical `cases` wins
- [ ] 5.3 Add test: workflows list with `matrix` generates `cases` skill/command once (also when both `matrix` and `cases` listed); notice printed; exit 0
- [ ] 5.4 Add test: change fixture with only `testmatrix.md` — status reports checkbox progress and publish instructions read it, with rename notice; new changes write `testcases.md`
- [ ] 5.5 Add test: update on a project with `qaspec-matrix` skill dir and `qsx-matrix.md` command removes both and generates `qaspec-cases` (Claude and Cursor layouts)
- [ ] 5.6 Final sweep: `rg -i "matrix" src/ docs/ schemas/ website/ test/` — triage every hit (legitimate uses like `qaspec-branding`'s "Product naming matrix" stay); then `pnpm lint && pnpm build && pnpm test`
