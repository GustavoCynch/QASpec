## Why

Delta specs are currently written in the cases phase, so the analyze phase validates intent without producing the normative artifact, and analysts never read existing capability specs — analysis of previously-reviewed functionality is blind to behavior the team already agreed on. Moving spec creation into analyze makes the pipeline spec-first: the analysis defines agreed behavior and the cases phase verifies it.

## What Changes

- **BREAKING** The analyze phase (`/qsx:analyze`, `qaspec-analyze` skill, `analyze` artifact) co-produces `specs/**/*.md` delta files together with `analysis.md` before its single halt; the halt covers approval of both artifacts.
- Analyze reads existing `qaspec/specs/<capability>/spec.md` for every affected capability before writing deltas (baseline for MODIFIED blocks and context for re-reviewed functionality).
- User clarifications after the analyze halt update both `analysis.md` (Validated clarifications) and the affected `specs/**/*.md` files — nothing stays chat-only.
- **BREAKING** The cases phase (`/qsx:cases`, `qaspec-cases` skill, `test-cases` artifact) no longer writes specs; it reads the approved delta specs as a binding input alongside `analysis.md` and its halt covers the case list only.
- Traceability inverts: every spec requirement must be covered by at least one case (no uncovered requirements), instead of requirements being derived from the case list.
- The `specs` artifact dependency stays `requires: [analyze]`; publish gating (both `test-cases` and `specs` required) is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qaspec-pr-review-schema`: the `analyze` artifact instruction now requires co-producing delta specs and reading existing capability specs; the `test-cases` and `specs` artifact instructions swap co-production for spec-first alignment.
- `qas-workflows-and-commands`: `qaspec-analyze` skill/command produces specs with `analysis.md` and reads spec baselines; `qaspec-cases` skill/command consumes specs instead of writing them.

## Impact

- `schemas/qaspec-pr-review/schema.yaml` — `analyze`, `test-cases`, and `specs` artifact instructions.
- `src/core/templates/workflows/analyze.ts` and `cases.ts` — generated skill/command bodies.
- `src/core/qa-config-seed.ts` — seeded rules referencing co-production in the cases phase.
- `openspec/specs/qaspec-pr-review-schema/spec.md` and `openspec/specs/qas-workflows-and-commands/spec.md` — main specs (via delta sync).
- Tests covering schema instructions, generated skills, and config seed text.
- Existing user projects pick up the new flow on `qaspec update` (regenerated skills/commands); in-flight changes that already produced specs in cases are unaffected.
