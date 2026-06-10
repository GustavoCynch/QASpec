# Rename Matrix to Cases

## Why

"Matrix" is a misnomer: a test matrix is a factors-by-conditions grid, but the artifact this phase produces is a hierarchical list of test cases with preconditions and steps. Testers reading `/qsx:matrix` or `testmatrix.md` get the wrong mental model. Renaming the phase to "cases" (artifact `testcases.md`) says exactly what the phase produces and matches the vocabulary of TCMS tools like Qase ("test cases", "suites").

## What Changes

- **BREAKING**: Workflow id `matrix` becomes `cases`; the QA pipeline reads `analyze → cases → publish → archive`.
- The skill `qaspec-matrix` becomes `qaspec-cases`; the command `/qsx:matrix` becomes `/qsx:cases`.
- In the `qaspec-pr-review` schema, artifact id `test-matrix` becomes `test-cases` and generates `testcases.md` (template file renamed accordingly); the publish phase tracks `testcases.md`.
- Project config surface renames with backward-compatible reads:
  - `rules.test-matrix` becomes `rules.test-cases` (legacy key still injected with a notice).
  - `workflow.multipleSubagents.matrix` becomes `workflow.multipleSubagents.cases` (legacy key still honored with a notice).
  - Global config workflow lists containing `matrix` are mapped to `cases` at resolution with a notice (rename, not retirement — unlike `explore`, the id is not dropped).
- In-flight changes that already contain `testmatrix.md` keep working: progress tracking and publish fall back to `testmatrix.md` when `testcases.md` does not exist, with a notice suggesting a rename.
- `qaspec init` and `qaspec update` remove stale `qaspec-matrix` skill directories and `qsx-matrix` command files (reusing the deselected-workflow cleanup), preserving upstream OpenSpec surfaces.
- All references in analyze/publish/archive skill bodies, seeded config rules, reference scaffolds, docs, and the website switch to the new names.

Out of scope: publish flow redesign (separate proposal `slim-publish-flow`), renaming `analisis.md` and `/qas:` prefix leftovers (separate proposal `cleanup-leftovers`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `qas-workflows-and-commands`: Core workflow set becomes `analyze`, `cases`, `publish`, `archive`; skill `qaspec-cases`; legacy `matrix` id maps to `cases`; stale matrix artifacts cleaned up.
- `command-generation`: Registry maps `cases` (not `matrix`) to QASpec template getters.
- `qsx-command-naming`: Command file/frontmatter examples use `qsx-cases.md` and `/qsx:cases`.
- `qaspec-pr-review-schema`: Artifact `test-cases` generates `testcases.md`; phase coupling, checkbox tracking, publish `tracks`, and subagent-flag wording follow the new names; legacy `testmatrix.md` tracked as fallback for in-flight changes.
- `qas-config-seed`: Seed rules keyed `test-cases`; seed includes `workflow.multipleSubagents.cases: false`.
- `config-loading`: Parses `workflow.multipleSubagents.cases`; legacy `matrix` key read with notice.
- `cli-init`: Success output hints say `/qsx:cases`.
- `artifact-language-policy`: Language policy examples reference `testcases.md` and the cases phase.
- `qaspec-init-references`: Generated instructions reference the cases workflow.
- `product-landing-site`: Landing examples reference `/qsx:cases`.

## Impact

- **Renamed files**: `src/core/templates/workflows/matrix.ts` → `cases.ts`; `schemas/qaspec-pr-review/templates/testmatrix.md` → `testcases.md`.
- **Modified**: `schemas/qaspec-pr-review/schema.yaml`, `src/core/profiles.ts`, `src/core/shared/skill-generation.ts`, `src/core/shared/tool-detection.ts`, `src/core/profile-sync-drift.ts`, `src/core/project-config.ts`, `src/core/qa-config-seed.ts`, `src/core/subagent-mode.ts`, `src/core/artifact-graph/instruction-loader.ts`, `src/core/templates/workflows/{analyze,publish,qas-archive,qas-workflow-preamble}.ts`, `src/core/reference-scaffold.ts`, `src/commands/config.ts`, `src/ui/welcome-screen.ts`, `src/core/{init,update,migration}.ts`.
- **Docs**: `docs/workflows.md`, `docs/commands.md`, `docs/getting-started.md`, `docs/concepts.md`, `docs/cli.md`, `README.md`, `website/`.
- **Tests**: every suite referencing `matrix`, `test-matrix`, `testmatrix.md`, `qaspec-matrix`, or `/qsx:matrix`.
- **Users**: `/qsx:matrix` disappears after `qaspec update`; configs and in-flight changes keep working through the legacy aliases above.
