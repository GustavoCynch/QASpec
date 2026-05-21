## Context

QASpec’s application layer (`src/core/init.ts`, `update.ts`, `skill-generation.ts`, templates) still ships two agent surfaces:

1. **QASpec QA** — `qas-*` skills, `/qas:*` commands, core profile (`explore`, `analyze`, `matrix`, `publish`, `archive`).
2. **Legacy OpenSpec** — `openspec-*` skills, `/opsx:*` commands, optional custom profile workflow ids (`propose`, `new`, `apply`, …).

The fork’s product goal is QA-only delivery. The `openspec/` directory in this repo remains the planning/spec store (and OpenSpec CLI is still used in-repo). `.cursor/commands/opsx-*` in the QASpec repository are maintainer-only and must not be deleted.

## Goals / Non-Goals

**Goals:**

- Single install surface from QASpec CLI: only `qas-*` / `/qas:*` artifacts.
- Remove legacy template registries (`LEGACY_*_ENTRIES`, opsx command templates) from generation paths.
- Update user-visible strings (init, update, workflow instructions, migration) to reference QASpec only.
- On init/update without upstream OpenSpec, remove previously QASpec-installed `openspec-*` and `opsx-*` files via existing legacy cleanup registry (extend registry if needed).
- Keep upstream detection so third-party OpenSpec installs are not overwritten or deleted.

**Non-Goals:**

- Delete `openspec/` in repo or consumer projects used as planning home.
- Remove `.cursor/commands/opsx-*` or `openspec-*` skills committed in the QASpec repo.
- Remove `openspec` npm binary / dev dependency.
- Rename internal `hasActiveUpstreamOpenSpec` and related helpers.

## Decisions

### 1. Delete legacy generation registries (not feature-flag)

**Choice:** Remove `LEGACY_WORKFLOW_ENTRIES`, `LEGACY_COMMAND_ENTRIES`, `LEGACY_SHARED_*`, and associated template imports from `getSkillTemplates` / `getCommandTemplates` default paths. `getCoexistenceSkillTemplates` collapses to profile workflows only (QASpec entries).

**Rationale:** User asked for complete removal from the application; dead templates increase maintenance and test surface.

**Alternative:** Keep templates behind `profile: custom` — rejected; no QASpec-owned OpenSpec surface.

### 2. Trim `ALL_WORKFLOWS` and custom profile validation

**Choice:** Remove legacy workflow ids from `ALL_WORKFLOWS` (or reject them in `qaspec config profile custom`). `OLD_CORE_WORKFLOWS` migration stays; unknown legacy ids in custom profiles are ignored or migrated to core on init.

**Rationale:** Prevents silent expectation that `propose` still installs.

**Alternative:** Keep ids but no-op — rejected; confusing.

### 3. Coexistence = read-only for upstream only

**Choice:** Retain `hasActiveUpstreamOpenSpec` and skip-write/skip-delete behavior for detected upstream artifacts. QASpec never writes `openspec-*` or `opsx-*` itself.

**Rationale:** Users may still install upstream OpenSpec separately; QASpec must not destroy it.

### 4. Legacy cleanup expands for QASpec-installed legacy

**Choice:** When upstream is not active, init/update cleanup removes `openspec-*` and `opsx-*` files that match the explicit legacy registry (already partially present). Add removal of QASpec-generated legacy skill dirs on update when profile is core.

**Rationale:** Upgrades should not leave stale dual surface in target projects.

### 5. Workflow instruction strings

**Choice:** Replace `openspec-continue-change` references in `src/commands/workflow/instructions.ts` with `qas-*` equivalents or generic “complete missing artifacts via QASpec workflow” without naming removed skills.

**Rationale:** CLI `qaspec` workflow commands are product surface.

### 6. Template file disposition

**Choice:** Delete unused files under `src/core/templates/` for opsx/openspec skills and commands after registry removal, or keep files only if imported by repo-internal `.cursor` generation (likely not — those are committed). Prefer delete + test updates.

**Rationale:** Avoid “ghost” templates reintroduced by mistake.

### 7. Fork dogfooding exception (documented in spec)

**Choice:** `qas-workflows-and-commands` keeps maintainer exception: repo may commit `opsx-*` / `openspec-*` under `.cursor/` for spec-driven work; product init must not require them in the fork tree.

**Rationale:** Matches user constraint (“no eliminar comandos de Cursor” in repo).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Users with custom profile depending on `propose`/`apply` lose QASpec-generated legacy skills | Document BREAKING in proposal; migration forces core profile when legacy four-id set detected |
| Upstream OpenSpec users expect QASpec to refresh `openspec-propose` | Coexistence spec unchanged for skip-overwrite; they use upstream update |
| Large test churn | Update init/update/skill-generation tests in one pass; temp-dir smoke only |
| Accidental deletion of repo `.cursor/opsx-*` during dev | Legacy cleanup paths must be project-target only, never run against QASpec repo root in tests without temp dir |

## Migration Plan

1. Ship code + spec deltas.
2. On next `qaspec init` / `qaspec update` in consumer projects: migrate legacy global profile → core; generate `qas-*` only; cleanup removes old `openspec-*`/`opsx-*` when upstream inactive.
3. No data migration for `openspec/` planning directory.
4. Rollback: revert release; re-run init would not restore legacy templates without code rollback.

## Open Questions

- Whether to remove legacy workflow ids from `qaspec config profile` interactive picker entirely or show disabled with message — prefer **remove from picker**.
- Archive change `enrich-qas-workflows-config-rules` in progress — coordinate apply order to avoid merge conflicts in `skill-generation.ts`.
