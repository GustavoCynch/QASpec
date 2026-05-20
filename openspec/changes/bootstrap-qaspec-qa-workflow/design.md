## Context

- **Roadmap:** `roadmap/11-proposed-workflow-phases.md` defines the target UX (`/qas:*`, schema `qaspec-pr-review`, references under `qaspec/references/`).
- **Today:** Fork still uses `CORE_WORKFLOWS = ['propose', 'explore', 'apply', 'sync', 'archive']`, generates `opsx-*` / `openspec-*`, and keeps `qa-pr-review` as a standalone skill under `.agents/skills/`.
- **Motor:** Artifact graph, `instructions --json`, checkbox progress, and `schema fork` already exist — this change composes them rather than replacing the engine.

## Goals / Non-Goals

**Goals:**

- Ship `schemas/qaspec-pr-review/` with three artifacts and `publish.tracks: testmatrix.md`.
- Switch product **core profile** to QASpec workflows and command/skill naming (`qas-*`, `/qas:*`).
- Scaffold reference files on init; wire analyze/matrix/publish templates from `qa-pr-review` content.
- Update tests and legacy cleanup for new command filenames.

**Non-Goals:**

- Renaming CLI binary `openspec` → `qaspec` (roadmap 07).
- Renaming planning directory `openspec/` → `qaspec/` in this change.
- Implementing or testing Qase MCP inside the CLI (agent-only).
- Removing `spec-driven` schema or OPSX workflows from the codebase (remain for internal dogfooding / custom profile).

## Decisions

### 1. Implement schema before renaming CLI

Fork schema via `openspec schema fork spec-driven qaspec-pr-review`, then edit YAML/templates. Keeps validation and `openspec new --schema qaspec-pr-review` testable without a binary rename.

### 2. Replace `CORE_WORKFLOWS` for the default product profile

```text
Before: propose, explore, apply, sync, archive
After:  explore, analyze, matrix, publish, archive
```

`propose` / `apply` / `sync` stay in `ALL_WORKFLOWS` for custom/full installs and this repo's own spec-driven changes.

### 3. Single code path for command prefix

Introduce a product constant (e.g. `QASPEC_COMMAND_PREFIX = 'qas'`) used by Cursor and other adapters instead of duplicating `opsx` strings. Legacy cleanup lists both `opsx-*` and `qas-*` patterns during transition.

### 4. Template split from `qa-pr-review`

| Source phase | Template module | Skill dir |
|--------------|-----------------|-----------|
| Explore stance + QA guardrails | `explore.ts` (adapt) | `qas-explore` |
| Phase 1 + dual analyst | `analyze.ts` (new) | `qas-analyze` |
| Phase 2 + checkboxes | `matrix.ts` (new) | `qas-matrix` |
| Phase 3–4 + validation | `publish.ts` (new) | `qas-publish` |
| Archive | `archive-change.ts` (adapt) | `qas-archive` |

References in templates point to `qaspec/references/`, not `.cursor/skills/qa-pr-review/references/`.

### 5. Default schema in generated config

New projects get `schema: qaspec-pr-review` in `openspec/config.yaml`. This repo's change `bootstrap-qaspec-qa-workflow` stays on `spec-driven` until archive/sync.

### 6. Checkbox template in schema instruction

Mirror `spec-driven` `tasks.md` instruction block in `test-matrix` artifact `instruction` so agents and validators agree on `- [ ]` format.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Large test snapshot churn (paths `opsx-` → `qas-`) | Dedicated task group; run full test suite on Windows CI |
| Users with existing `opsx-*` commands | `openspec update` regenerates; legacy cleanup removes stale `opsx-*` when configured |
| Partial MODIFIED specs in delta | Prefer ADDED blocks where possible; full copy for `cli-init` AI Tool Configuration |
| Dual profile confusion (dev vs QA) | Document in README: internal changes use `spec-driven`; QA projects use `qaspec-pr-review` |

## Migration Plan

1. Land schema + templates in `schemas/qaspec-pr-review/`.
2. Land workflow templates + registry + adapters + profiles.
3. Extend init for references + messaging.
4. Run `openspec init` / `update` in fixture tests; manual smoke: `openspec new smoke --schema qaspec-pr-review`, `/qas:analyze` on sample PR.
5. Follow-up change: delete `.agents/skills/qa-pr-review/` after parity review.

## Open Questions

- Whether default init profile rename from "core" to `qa-core` is user-visible — defaulting `CORE_WORKFLOWS` may be enough for v1.
- Keep `openspec-propose` templates in tree for custom profile only, or move to `schemas/spec-driven` adjunct — lean toward keep in `ALL_WORKFLOWS` but not core.
