## Context

`/qsx:publish` maps to `qaspec-publish` and the `qaspec-pr-review` schema `apply` phase. Today the workflow template (`src/core/templates/workflows/publish.ts`) and `schema.yaml` tell agents to resolve Qase prerequisites, persist `execution-context.md`, then immediately validate and upload via MCP. Matrix already uses a single approval halt; publish lacks an equivalent gate before irreversible TCMS writes.

## Goals / Non-Goals

**Goals:**

- Two-step publish in one slash invocation: **prepare** (files) → **halt** (user edit/confirm) → **apply** (MCP + log + checkboxes).
- Reuse existing artifacts: extend `execution-context.md`, add `publish-plan.md` as the human-readable upload preview.
- Align schema instructions, QA config seed, skill template, and main specs.

**Non-Goals:**

- Splitting publish into two separate CLI commands or schema artifact ids.
- Changing Qase MCP tools or adding non-Qase TCMS support.
- Requiring a second `/qsx:publish` run after confirmation (one command, two agent turns/messages is fine).

## Decisions

### 1. Add `publish-plan.md` as the review artifact

**Choice:** New template `schemas/qaspec-pr-review/templates/publish-plan.md` listing suites and unchecked cases from `testmatrix.md`, plus target Qase project from `execution-context.md`.

**Alternatives:**

- Only `execution-context.md` — too thin for case-level review.
- Inline chat-only preview — not editable in repo; user asked for a file first.

**Rationale:** Mirrors matrix’s file-first pattern; user can edit scope in the change directory before confirm.

### 2. Single confirmation halt (same pattern as matrix)

**Choice:** After writing `execution-context.md` and `publish-plan.md`, agent asks exactly one question: edit files or confirm publish. No MCP until confirm.

**Alternatives:**

- Implicit “continue in next message” without explicit question — weaker contract.
- Two halts (prerequisites + confirm) — keep prerequisite collection as today (one halt if missing fields only); add separate confirm halt only when files are ready.

### 3. Update layers in lockstep

| Layer | Change |
|-------|--------|
| `publish.ts` | Reorder steps: prepare files → halt → MCP |
| `schema.yaml` `apply.instruction` | Same ordering; mention `publish-plan.md` |
| `qa-config-seed.ts` `apply` rules | Prepare + confirm before MCP |
| Templates | Add `publish-plan.md` |
| Tests | Snapshot/parity for publish template strings |

### 4. Continuation after user edits

**Choice:** If user edits `publish-plan.md` or `execution-context.md` in chat after halt, agent updates files and re-asks confirm (no MCP until confirm). Same as matrix iteration pattern.

## Risks / Trade-offs

- **[Risk] Agents still upload in one turn** → Mitigation: explicit “do not invoke Qase MCP in the same message” in template, schema, and seed; parity tests assert substring.
- **[Risk] Extra file to maintain** → Mitigation: minimal template; optional sections only.
- **[Trade-off] Two chat turns for publish** → Acceptable; user explicitly requested confirm gate.

## Migration Plan

1. Ship template + schema + skill changes together in one release.
2. Existing changes with `execution-context.md` from partial publish: next `/qsx:publish` overwrites/updates plan file and still requires confirm.
3. No CLI flag; behavior is instruction-only.

## Open Questions

- Whether `publish-plan.md` should include estimated case count only vs full case titles (default: full titles from unchecked matrix rows).
