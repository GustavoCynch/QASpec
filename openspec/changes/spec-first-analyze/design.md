## Context

In the `qaspec-pr-review` schema, the analyze phase produces `analysis.md` only and explicitly forbids writing specs; delta specs are co-produced with `testcases.md` in the cases phase. Only the cases phase reads existing `qaspec/specs/<capability>/spec.md` baselines, so analysis of previously-reviewed functionality never consults agreed behavior. The flow being changed spans the schema artifact instructions (`schemas/qaspec-pr-review/schema.yaml`), the generated skill/command bodies (`src/core/templates/workflows/analyze.ts`, `cases.ts`), the seeded per-artifact rules (`src/core/qa-config-seed.ts`), and the main specs that document the contract.

## Goals / Non-Goals

**Goals:**
- Specs are drafted in the analyze phase, co-produced with `analysis.md`, and covered by the same single halt.
- Analyze reads existing capability specs before writing deltas, so re-reviewed functionality builds on agreed behavior.
- Post-halt clarifications update both `analysis.md` and affected delta specs.
- Cases phase consumes approved specs as binding input and guarantees every requirement scenario is covered by at least one case.

**Non-Goals:**
- No changes to the publish phase gating (`test-cases` + `specs` still required) or its instruction body beyond unchanged references.
- No changes to the spec delta format (ADDED/MODIFIED/REMOVED/RENAMED) or the `templates/spec.md` template structure.
- No migration of in-flight user changes that already produced specs during cases.
- No new CLI commands or schema artifacts.

## Decisions

### 1. Co-produce specs before the analyze halt, not after (Option A)

Specs are drafted together with `analysis.md` and the existing single halt covers approval of both. The alternative (write specs only after the user answers the halt) was rejected because it breaks the one-halt-per-phase mechanic: post-halt specs would either land unapproved or require a second halt. Co-production mirrors the existing `analysis.md` lifecycle — draft → halt → update with **Validated clarifications** — and a concrete draft SHALL/MUST surfaces wrong assumptions faster than narrative analysis. The safety rule is explicit: every clarification updates both artifacts; nothing stays chat-only.

### 2. `test-cases` gains a dependency on `specs`

Schema dependency moves from `analyze → (test-cases | specs)` to `analyze → specs → test-cases`. Since specs are co-produced inside the analyze phase, declaring `requires: [analyze, specs]` on `test-cases` makes `openspec status` reflect reality: cases are blocked until specs exist. The `specs` artifact keeps `requires: [analyze]` (analysis.md is written first within the same phase, same as today where cases writes it after analyze). Publish `apply.requires` is unchanged.

### 3. Traceability inverts: no uncovered requirements

Today the rule is "no orphan requirements" (specs must align to the case list). Spec-first flips it: in the cases phase, every requirement scenario in the change's delta specs must map to at least one test case; the self-audit before the cases halt checks coverage in that direction. Cases may still add exploratory/regression cases beyond the specs.

### 4. Analyze subagent flag governs spec drafting

Spec drafting in analyze falls under the existing `workflow.multipleSubagents.review` flag (dual blind analysts also propose requirement deltas when true; orchestrator-only when false). The `workflow.multipleSubagents.cases` flag keeps governing only case drafting. No new config keys.

### 5. Seeded rules move with the phase

`qa-config-seed.ts` changes: `rules.analyze` gains spec co-production and baseline-reading lines and drops "do not write specs/**/*.md in analyze"; `rules.test-cases` drops co-production and the dual-artifact halt, gaining "read approved delta specs as binding input"; `rules.specs` realigns from "aligned with testcases.md" to "aligned with analysis.md; every scenario covered by cases". Generated skill metadata versions bump (1.3 → 1.4).

## Risks / Trade-offs

- [Existing user projects keep stale seeded rules in `qaspec/config.yaml` (e.g. "do not write specs in analyze") that contradict regenerated skills] → Skills and schema instructions are regenerated on `qaspec update` and state the new flow authoritatively; document the rule conflict in the changelog and have the analyze skill body name specs co-production explicitly so a stale config rule is visibly outdated rather than silently followed. Verify during implementation whether seeded-rule migration on update is feasible; if not, changelog guidance is the fallback.
- [Specs drafted before validation may encode wrong intent if the user's halt answer changes direction] → Accepted by design (Option A); mitigated by the mandatory both-artifact update on clarifications and by analysis.md remaining the narrative source of truth.
- [Analyze phase gets heavier (reads baselines + writes two artifacts), lengthening time-to-first-halt] → Accepted; it removes the same work from cases, and baseline reading is bounded by the affected-capabilities list.
- [Glob artifact (`specs/**/*.md`) as a dependency of `test-cases` relies on file-existence detection] → Same detection already used for publish gating today; covered by tests.
