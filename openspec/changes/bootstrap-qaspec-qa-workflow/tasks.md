## 1. Schema qaspec-pr-review

- [x] 1.1 Run `openspec schema fork spec-driven qaspec-pr-review` and commit `schemas/qaspec-pr-review/`
- [x] 1.2 Edit `schema.yaml`: artifacts `analyze`, `test-matrix`, `publish`; `publish.tracks: testmatrix.md`; no intake; artifact `instruction` fields tell agents to use project language from config `context`/`rules`
- [x] 1.3 Add templates `analisis.md`, `testmatrix.md` (checkbox sections), publish instructions for `publish-log.md` / optional `execution-context.md`
- [x] 1.4 Run `openspec schema validate qaspec-pr-review` and fix validation errors
- [x] 1.5 Smoke: `openspec new change smoke-qa --schema qaspec-pr-review` + `openspec status --json`

## 2. Workflow templates (qa-pr-review → qas-*)

- [x] 2.1 Add `src/core/templates/workflows/analyze.ts`, `matrix.ts`, `publish.ts` from `qa-pr-review/SKILL.md` phases (English instructions; no hardcoded end-user locale)
- [x] 2.2 Adapt `explore.ts` and `archive-change.ts` for QA guardrails and `qaspec` CLI references in bodies
- [x] 2.3 Export getters in `skill-templates.ts`; register in `skill-generation.ts` with `qas-*` dir names
- [x] 2.4 Update `profiles.ts` `CORE_WORKFLOWS` to `explore`, `analyze`, `matrix`, `publish`, `archive`
- [x] 2.5 Update `init.ts` `WORKFLOW_TO_SKILL_DIR` and `SKILL_NAMES` / tool-detection for new dirs

## 3. Command generation and adapters

- [x] 3.1 Introduce shared QASpec command prefix constant; update Cursor adapter (`qas-<id>.md`, `/qas:<id>`)
- [x] 3.2 Update remaining adapters under `command-generation/adapters/` for `qas-` paths
- [x] 3.3 Update `command-references.ts` for `/qas:` → `/qas-` transform
- [x] 3.4 Update `legacy-cleanup.ts` patterns for `qas-*` and removal of stale `opsx-*` on refresh
- [x] 3.5 Update `welcome-screen.ts`, init/update success strings to `/qas:*`

## 4. Init references and language

- [x] 4.1 Add English canonical reference seeds in `src/`; optional locale variants or init-time selection for translated scaffolds
- [x] 4.2 Implement scaffold in `InitCommand` (create-if-missing only, path.join); seed language matches resolved project language
- [x] 4.3 Set default `schema: qaspec-pr-review` and `context` language block in generated `openspec/config.yaml` (optional init prompt for locale)
- [x] 4.4 Document in `docs/multi-language.md` (QASpec section): code English, artifacts/references follow config
- [x] 4.4 Add tests for reference scaffolding on Windows paths (path.join expectations)

## 5. Tests and documentation

- [x] 5.1 Update command-generation and init test snapshots for `qas-` naming
- [x] 5.2 Add integration test: core profile emits five QASpec workflows only
- [x] 5.3 Align `roadmap/05-custom-schema-and-artifacts.md` with doc 11 (no mandatory intake)
- [x] 5.4 Note in README or roadmap: `qa-pr-review` superseded; removal in follow-up change

## 6. Verification

- [x] 6.1 `pnpm test` (full suite)
- [x] 6.2 Manual: `openspec init` in temp dir → verify `qaspec/references/*`, `.cursor/commands/qas-*.md`, skills `qas-*`
- [x] 6.3 Manual: create change with `qaspec-pr-review`, run `openspec instructions` for each artifact id
