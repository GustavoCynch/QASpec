## 1. Schema and template

- [ ] 1.1 Update `schemas/qaspec-pr-review/templates/testmatrix.md` with enriched example (Preconditions + Steps table under checkbox line)
- [ ] 1.2 Extend `test-matrix` and `apply` instruction blocks in `schemas/qaspec-pr-review/schema.yaml` (source traceability, no title-only publish)
- [ ] 1.3 Run `qaspec schema validate qaspec-pr-review` and fix any validation errors

## 2. Config seed and workflows

- [ ] 2.1 Add `rules.test-matrix` entries in `src/core/qa-config-seed.ts` for enriched bodies, anti-vague steps, and gap documentation
- [ ] 2.2 Update `src/core/templates/workflows/matrix.ts` — format steps, source-first drafting, self-audit before halt
- [ ] 2.3 Update `src/core/templates/workflows/publish.ts` — read Preconditions/Steps from matrix case blocks for plan and MCP
- [ ] 2.4 Update `src/core/reference-scaffold.ts` if matrix→Qase mapping text needs the new blocks

## 3. Generated surfaces and docs

- [ ] 3.1 Regenerate or update `.cursor/commands/qsx-matrix.md` and `.cursor/skills/qaspec-matrix/SKILL.md` via `qaspec update` (or fixture sync)
- [ ] 3.2 Document enriched matrix example in `docs/workflows.md` or `docs/commands.md`

## 4. Main specs and verification

- [ ] 4.1 Archive change: merge deltas into `openspec/specs/qaspec-pr-review-schema/spec.md`, `openspec/specs/qas-workflows-and-commands/spec.md`; add `qas-config-seed` to main specs if missing
- [ ] 4.2 Smoke: `qaspec new change tmp-enriched --schema qaspec-pr-review`; after mock `analisis.md`, confirm `test-matrix` instructions mention Preconditions/Steps
- [ ] 4.3 Extend init/update or skill-generation test if template markers are asserted
