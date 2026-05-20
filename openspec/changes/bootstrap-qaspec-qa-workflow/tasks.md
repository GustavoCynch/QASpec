## 1. Schema qaspec-pr-review

- [ ] 1.1 Run `openspec schema fork spec-driven qaspec-pr-review` and commit `schemas/qaspec-pr-review/`
- [ ] 1.2 Edit `schema.yaml`: artifacts `analyze`, `test-matrix`, `publish`; `publish.tracks: testmatrix.md`; no intake
- [ ] 1.3 Add templates `analisis.md`, `testmatrix.md` (checkbox sections), publish instructions for `publish-log.md` / optional `execution-context.md`
- [ ] 1.4 Run `openspec schema validate qaspec-pr-review` and fix validation errors
- [ ] 1.5 Smoke: `openspec new change smoke-qa --schema qaspec-pr-review` + `openspec status --json`

## 2. Workflow templates (qa-pr-review → qas-*)

- [ ] 2.1 Add `src/core/templates/workflows/analyze.ts`, `matrix.ts`, `publish.ts` from `qa-pr-review/SKILL.md` phases
- [ ] 2.2 Adapt `explore.ts` and `archive-change.ts` for QA guardrails and `qaspec` CLI references in bodies
- [ ] 2.3 Export getters in `skill-templates.ts`; register in `skill-generation.ts` with `qas-*` dir names
- [ ] 2.4 Update `profiles.ts` `CORE_WORKFLOWS` to `explore`, `analyze`, `matrix`, `publish`, `archive`
- [ ] 2.5 Update `init.ts` `WORKFLOW_TO_SKILL_DIR` and `SKILL_NAMES` / tool-detection for new dirs

## 3. Command generation and adapters

- [ ] 3.1 Introduce shared QASpec command prefix constant; update Cursor adapter (`qas-<id>.md`, `/qas:<id>`)
- [ ] 3.2 Update remaining adapters under `command-generation/adapters/` for `qas-` paths
- [ ] 3.3 Update `command-references.ts` for `/qas:` → `/qas-` transform
- [ ] 3.4 Update `legacy-cleanup.ts` patterns for `qas-*` and removal of stale `opsx-*` on refresh
- [ ] 3.5 Update `welcome-screen.ts`, init/update success strings to `/qas:*`

## 4. Init references

- [ ] 4.1 Add reference template files (or inline strings) for historical bugs and Qase rules
- [ ] 4.2 Implement scaffold in `InitCommand` (create-if-missing only, path.join)
- [ ] 4.3 Set default `schema: qaspec-pr-review` in generated `openspec/config.yaml` for new projects
- [ ] 4.4 Add tests for reference scaffolding on Windows paths (path.join expectations)

## 5. Tests and documentation

- [ ] 5.1 Update command-generation and init test snapshots for `qas-` naming
- [ ] 5.2 Add integration test: core profile emits five QASpec workflows only
- [ ] 5.3 Align `roadmap/05-custom-schema-and-artifacts.md` with doc 11 (no mandatory intake)
- [ ] 5.4 Note in README or roadmap: `qa-pr-review` superseded; removal in follow-up change

## 6. Verification

- [ ] 6.1 `pnpm test` (full suite)
- [ ] 6.2 Manual: `openspec init` in temp dir → verify `qaspec/references/*`, `.cursor/commands/qas-*.md`, skills `qas-*`
- [ ] 6.3 Manual: create change with `qaspec-pr-review`, run `openspec instructions` for each artifact id
