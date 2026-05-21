## Context

Analyze (`/qsx:analyze`) and matrix (`/qsx:matrix`) workflows embed `QAS_DUAL_ANALYST_PROTOCOL` in generated skills and mandate two parallel blind Task subagents in `schemas/qaspec-pr-review/schema.yaml`. The orchestrator only synthesizes after both analysts return. There is no project-level toggle; teams that want a single pass must still pay for two subagent runs or violate instructions.

## Goals / Non-Goals

**Goals:**

- Configurable per-phase multi-subagent mode via `qaspec/config.yaml`, keyed as **review** (analyze / PR analysis) and **matrix**.
- Defaults: `review: false`, `matrix: false` in the QA config seed for new projects.
- When disabled: the **orchestrator** fetches the change set, reads references, and writes artifacts — **zero** Task delegations (not a single-analyst fallback).
- When enabled: preserve today's dual blind parallel Task protocol and synthesis notes (Agreed / Single-analyst / Contradiction).
- Same artifact quality rules (historical bugs, analisis authority, matrix traceability) regardless of mode.

**Non-Goals:**

- Changing the artifact graph or publish phase subagent policy.
- Runtime enforcement inside the CLI (agents remain instruction-driven).
- Auto-detecting "small PR" to skip analysts.

## Decisions

### 1. Config shape

```yaml
workflow:
  multipleSubagents:
    review: false   # analyze phase (/qsx:analyze, artifact analyze)
    matrix: false   # matrix phase (/qsx:matrix, artifact test-matrix)
```

- **`review`** maps to the analyze artifact and "PR review" language in docs (not a separate workflow id).
- Omitted keys default to **`false`** when `workflow.multipleSubagents` is present; when the whole `workflow` block is absent, instruction loader treats both as **`false`** for injection text (seed still writes explicit defaults on fresh init).

**Rejected:** Top-level `multipleSubagentsInReview` — flatter but does not group future workflow toggles.

### 2. Three execution modes per phase (documented in skills + injected instructions)

| `multipleSubagents.<phase>` | Behavior |
|----------------------------|----------|
| `true` | Two parallel blind Task runs → orchestrator synthesis |
| `false` | Orchestrator only — fetch diff, read refs, write output inline |
| Task unavailable + `true` | Halt with message to set flag `false` or retry when Task exists (no silent single subagent) |

**Rejected:** Single subagent when `false` — user explicitly asked for main agent, not one subagent.

### 3. Instruction injection (loader)

`instruction-loader.ts` reads parsed config and appends a **Subagent mode** block to enriched JSON for `analyze` and `test-matrix` when schema is `qaspec-pr-review`:

- `false` → "Orchestrator-only: do not invoke Task subagents for this phase."
- `true` → existing dual-blind paragraph (or reference to schema text).

Schema `instruction` strings in `schema.yaml` become mode-neutral ("use subagent mode from project config") to avoid contradicting injected blocks.

### 4. Workflow template generation

Refactor `qas-workflow-preamble.ts`:

- `getQasDualAnalystProtocol(enabled: boolean)` — full protocol vs orchestrator-only paragraph
- `getQasAnalyzeBody(flags)` / `getQasMatrixBody(flags)` — step lists branch on flags

Generated skills at `qaspec update` embed **both** paths with "read `workflow.multipleSubagents` from config" so offline agents without fresh JSON still see the contract. English source; config keys documented in seed comment.

### 5. Synthesis notes when orchestrator-only

`analisis.md` **Synthesis notes** MAY state `Orchestrator-only (multipleSubagents.review: false)` instead of Agreed/Contradiction tables — template instruction allows N/A for dual-analyst sections when not used.

### 6. Migration

- **Fresh init:** seed `review: false`, `matrix: false`.
- **Existing teams relying on dual analysts:** set `review: true` and/or `matrix: true` in config (document in changelog/docs).
- No automatic rewrite of consumer `config.yaml` on update.

## Risks / Trade-offs

- **[Risk] Lower diversity of analysis with orchestrator-only** → Mitigation: opt-in `true` per phase; rules unchanged.
- **[Risk] Agents ignore config** → Mitigation: injected JSON + skill preamble + schema alignment; manual review in verify.
- **[Risk] Breaking expectation "dual by default"** → Mitigation: explicit migration note; archive change documents flip for existing adopters.

## Migration Plan

1. Ship parser + seed + loader injection + template refactor.
2. Run `qaspec update` in repo; document config snippet in `docs/workflows.md`.
3. Maintainers with dual-analyst reliance add `review: true` / `matrix: true` before upgrading agent habits.

## Open Questions

- Whether to expose the same flags in global `~/.config/qaspec` (out of scope unless product asks — project config only for v1).
