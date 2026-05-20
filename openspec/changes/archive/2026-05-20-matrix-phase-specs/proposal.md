## Why

After bootstrap of `qaspec-pr-review`, QA changes only produced `analisis.md` and `testmatrix.md`. Testers refine **cases and agreed behavior** in the matrix phase (`/qas:matrix`), but there was no durable requirement artifact in the change for later test passes or archive sync to `openspec/specs/`. OpenSpec’s specs model (delta specs + main specs) was intentionally deferred; we now want that continuity **without** a separate command or halt—specs are co-created and co-approved with the matrix.

## What Changes

- Add artifact `specs` to schema `qaspec-pr-review` (`generates: specs/**/*.md`), sibling of `test-matrix`, both requiring `analyze`.
- Extend `test-matrix` and `analyze` schema instructions: analyze seeds **Affected capabilities**; matrix phase produces **both** `testmatrix.md` and delta specs in one UX step.
- Update `apply.requires` to include `specs` and `test-matrix` before publish.
- Update `qas-matrix` skill/command templates: dual output, read `openspec/specs/` baseline, keep single halt for matrix + specs; chat iterations edit both files.
- Add `schemas/qaspec-pr-review/templates/spec.md` (delta format, aligned with spec-driven).
- Update main specs `qaspec-pr-review-schema` and `qas-workflows-and-commands`.
- Align `roadmap/11-proposed-workflow-phases.md` (and `roadmap/05` graph) with matrix + specs in phase 2.

No CLI binary rename. No new slash command (`/qas:specs`). **BREAKING** for consumers: publish is blocked until `specs/**/*.md` exists for the change (same as adding any new required artifact).

## Capabilities

### New Capabilities

- _(none — extending existing schema and workflow capabilities)_

### Modified Capabilities

- `qaspec-pr-review-schema`: Add `specs` artifact; parallel graph after `analyze`; publish requires specs + test-matrix; update minimal-path scenario.
- `qas-workflows-and-commands`: Matrix workflow produces and maintains delta specs with `testmatrix.md`; single halt; traceability to main specs.

## Impact

- `schemas/qaspec-pr-review/schema.yaml`, new template `templates/spec.md`, `templates/testmatrix.md` (traceability hint), `templates/analisis.md` (affected capabilities section).
- `src/core/templates/workflows/matrix.ts` (and related tests when templates land in phase 2 implementation).
- `openspec/specs/qaspec-pr-review-schema/spec.md`, `openspec/specs/qas-workflows-and-commands/spec.md`.
- `roadmap/11-proposed-workflow-phases.md`, `roadmap/05-custom-schema-and-artifacts.md`.
- `qas-archive` behavior unchanged: delta spec sync on archive when `changes/.../specs/` exist.
