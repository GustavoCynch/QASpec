## Why

The matrix phase (`/qsx:matrix`) produces `testmatrix.md` with only suite and case title. That forces teams to re-derive preconditions, steps, and expected results during publish or outside the repo, and encourages generic invented steps instead of content anchored to the diff, requirements, and code. Qase already requires those fields (`qase_test_case_rules.md`); the matrix artifact should be the approved source before MCP.

## What Changes

- **`testmatrix.md` template**: each case under `- [ ]` includes **Preconditions** and **Steps** blocks (action + expected result per step), aligned with `qase_test_case_rules.md` (standard environment/role prefix, step 1 navigation, transition steps with empty expected when applicable).
- **Schema `test-matrix` instructions**: require building steps from sources in hand (`analisis.md`, diff/PR, `qaspec/specs/`, referenced requirement sheets, repo code); forbid inventing vague flows unless sources lack detail — then an explicit, bounded generic step is allowed.
- **Seed rules `rules.test-matrix`**: same traceability and readable-narrative constraints (no code identifiers in case text).
- **`qas-matrix` workflow**: format steps and self-audit (each step cites a source or is marked as a gap inference).
- **Publish**: read preconditions/steps from each case block in `testmatrix.md` when building `publish-plan.md` and invoking Qase MCP (do not re-generate from title alone).
- **Product specs**: update requirements in `qaspec-pr-review-schema` and `qas-workflows-and-commands` for matrix format and content.

No CLI **BREAKING** changes. Artifact contract change: existing title-only matrices remain valid for checkbox tracking; new drafts must follow the enriched format.

## Capabilities

### New Capabilities

- _(none)_

### Modified Capabilities

- `qaspec-pr-review-schema`: `test-matrix` template and instructions require preconditions, steps, and expected results per case; enriched-format and source-traceability scenarios.
- `qas-workflows-and-commands`: matrix and publish consume the full case block; self-audit against vague steps.
- `qas-config-seed`: `test-matrix` rules aligned with the new artifact contract.

## Impact

- `schemas/qaspec-pr-review/templates/testmatrix.md`
- `schemas/qaspec-pr-review/schema.yaml` (artifact `test-matrix`, optionally `apply`)
- `src/core/qa-config-seed.ts`
- `src/core/templates/workflows/matrix.ts`, `publish.ts`
- `src/core/reference-scaffold.ts` (if it documents matrix → Qase mapping)
- `openspec/specs/qaspec-pr-review-schema/spec.md`, `openspec/specs/qas-workflows-and-commands/spec.md`
- `docs/workflows.md` or `docs/commands.md` (enriched matrix example)
- Init/update or template validation tests if `testmatrix.md` fixtures exist
