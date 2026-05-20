## 1. Schema and templates

- [ ] 1.1 Add `specs` artifact to `schemas/qaspec-pr-review/schema.yaml` (requires `analyze`; instructions for delta format and matrix coupling)
- [ ] 1.2 Set `apply.requires` to `[test-matrix, specs]`; keep `tracks: testmatrix.md`
- [ ] 1.3 Update `analyze` and `test-matrix` instructions in schema.yaml per design (affected capabilities, read main specs, co-produce specs)
- [ ] 1.4 Add `schemas/qaspec-pr-review/templates/spec.md` (delta structure from spec-driven)
- [ ] 1.5 Update `templates/analisis.md` with Affected capabilities section placeholder
- [ ] 1.6 Update `templates/testmatrix.md` with optional traceability comment example
- [ ] 1.7 Run `openspec schema validate qaspec-pr-review` and fix any errors

## 2. Workflow templates (qas-matrix / qas-analyze / qas-publish)

- [ ] 2.1 Update `src/core/templates/workflows/matrix.ts` — co-write specs, single halt, read `openspec/specs/`, chat iteration on both files
- [ ] 2.2 Update `src/core/templates/workflows/analyze.ts` — affected capabilities; explicit no specs in analyze step
- [ ] 2.3 Update `src/core/templates/workflows/publish.ts` — require change `specs/` when schema requires it; read specs for context
- [ ] 2.4 Regenerate or hand-update `.cursor/commands/qas-matrix.md` and `.cursor/skills/qas-matrix/SKILL.md` via init/update fixture if needed

## 3. Main specs and roadmap

- [ ] 3.1 Archive this change and sync deltas to `openspec/specs/qaspec-pr-review-schema/spec.md` and `openspec/specs/qas-workflows-and-commands/spec.md`
- [ ] 3.2 Update `roadmap/11-proposed-workflow-phases.md` — phase 2 outputs `testmatrix.md` + `specs/**/*.md`; graph diagram
- [ ] 3.3 Update `roadmap/05-custom-schema-and-artifacts.md` — v1 graph includes specs sibling under analyze

## 4. Verification

- [ ] 4.1 Smoke: `openspec new tmp-qa --schema qaspec-pr-review`; confirm `analyze`, `test-matrix`, and `specs` ready after `analisis.md`
- [ ] 4.2 Smoke: `openspec status --change tmp-qa --json` — publish blocked until both matrix and specs exist
- [ ] 4.3 Run `pnpm test` (init/schema tests if present); Windows path tasks use path.join in any new test expectations
