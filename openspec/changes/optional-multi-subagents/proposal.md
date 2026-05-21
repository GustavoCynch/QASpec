## Why

QASpec analyze and matrix workflows always require two parallel blind Task subagents when the Task tool exists. That adds latency and token cost for small PRs or teams that prefer a single orchestrator pass, and the current fallback ("stop if Task unavailable") does not define what happens when teams want full quality without subagents. Teams need an explicit, per-phase switch with safe defaults.

## What Changes

- Add optional `workflow.multipleSubagents` (or equivalent) in `qaspec/config.yaml` with **`review` (analyze)** and **`matrix`** booleans, both defaulting to **`false`** in the config seed.
- When a flag is **`false`**, the **orchestrator (main agent)** performs that phase end-to-end — **no** Task subagent delegations (not one analyst, not two).
- When a flag is **`true`**, retain the existing dual blind parallel Task protocol and synthesis merge for that phase.
- Inject phase-appropriate instructions from config via the instruction loader and generated workflow skills/commands so schema artifact text and agent surfaces stay aligned.
- Update product specs for workflows, PR-review schema, and config loading/seed.

No CLI **BREAKING** changes. Existing projects without the new keys behave as today only if we document migration: **new installs** get `false`/`false`; **existing** projects may need a one-line opt-in to keep dual analysts (`review: true`, `matrix: true`) until they adopt the new default.

## Capabilities

### New Capabilities

- _(none)_

### Modified Capabilities

- `qas-workflows-and-commands`: analyze and matrix skills/commands branch on config; orchestrator-only path when disabled; dual analysts when enabled.
- `qaspec-pr-review-schema`: `analyze` and `test-matrix` artifact instructions reference config flags instead of unconditionally requiring dual Task delegations.
- `qas-config-seed`: seed documents `workflow.multipleSubagents` defaults (`review: false`, `matrix: false`).
- `config-loading`: parse and validate optional `workflow.multipleSubagents` booleans; expose to instruction injection.

## Impact

- `src/core/project-config.ts` — Zod schema + parsing for `workflow.multipleSubagents`
- `src/core/qa-config-seed.ts` — default flags in seeded config
- `src/core/artifact-graph/instruction-loader.ts` — conditional analyst guidance in enriched instructions
- `src/core/templates/workflows/qas-workflow-preamble.ts` — parameterized dual vs orchestrator-only blocks
- `src/core/templates/workflows/analyze.ts`, `matrix.ts`
- `schemas/qaspec-pr-review/schema.yaml` — analyze / test-matrix instruction blocks
- `openspec/specs/qas-workflows-and-commands/spec.md`, `qaspec-pr-review-schema/spec.md`, `qas-config-seed/spec.md`, `config-loading/spec.md`
- `docs/workflows.md` or `docs/commands.md` — config example
- Tests for config parsing and instruction injection markers
