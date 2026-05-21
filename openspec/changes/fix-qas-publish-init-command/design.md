## Context

`getProfileWorkflows()` resolves workflows from global config (`~/.config/openspec/config.json` or platform equivalent). Users migrated from OpenSpec 1.x often have:

```json
{ "profile": "custom", "workflows": ["propose", "explore", "apply", "archive"] }
```

That set matches `OLD_CORE_WORKFLOWS` in `update.ts`. `usesQasWorkflowSurface()` returns false for it, so `getSkillTemplates()` / `getCommandContents()` emit legacy `openspec-*` / `opsx-*` artifacts only—no `qas-publish` skill or `/qas:publish` command. Init success UI gates QASpec hints on `activeWorkflows.includes('analyze')`, so users see `/opsx:propose` instead.

Templates and registry already support `publish`; the gap is profile resolution and migration timing.

## Goals / Non-Goals

**Goals:**

- Detect and auto-upgrade the legacy custom core workflow set to the current QASpec `core` profile before init/update generation.
- Ensure `qas-publish` skill and `publish` command files are created on init/update after upgrade.
- Show `/qas:publish` (and siblings) in post-init getting started when QASpec QA workflows are active.
- Add config-profile labels for `analyze`, `matrix`, `publish`.
- Cover behavior with tests using isolated global config fixtures.

**Non-Goals:**

- Forcing core profile on intentional custom mixes (e.g. `explore` + `propose` only).
- Changing upstream OpenSpec coexistence rules.
- Publishing a new npm major or renaming global config directory from `openspec` to `qaspec`.

## Decisions

### 1. Centralize legacy profile upgrade in `migration.ts`

Add `migrateLegacyCoreProfileIfNeeded()` that:

- Reads global config via `getGlobalConfig()` / raw file.
- If `profile === 'custom'` and `workflows` is exactly `OLD_CORE_WORKFLOWS` (same length and every id present), set `profile: 'core'`, clear custom `workflows` (or set to `CORE_WORKFLOWS`), and `saveGlobalConfig()`.
- Log one dim line: migrated to QASpec core profile.

**Rationale:** Single source of truth; init and update both call it. Matches existing `OLD_CORE_WORKFLOWS` constant in `update.ts`—export or move constant to `profiles.ts` to avoid duplication.

**Alternative:** Only document `qaspec config profile core` — rejected; users already hit the bug silently.

### 2. Invoke migration on every init and update (not only extend mode)

Call `migrateLegacyCoreProfileIfNeeded()` at the start of `InitCommand.execute()` and `UpdateCommand` profile resolution, before `getProfileWorkflows()`.

**Rationale:** Fresh inits on new repos still read stale global config (reproduced: 4 legacy commands, no `qas-publish`).

### 3. Broaden getting-started gate

Replace `activeWorkflows.includes('analyze')` with a helper `usesQasWorkflowSurface(activeWorkflows)` (already exists in `skill-generation.ts`—export or duplicate thin wrapper in shared) so `matrix` or `publish` alone also shows QASpec hints.

### 4. Config profile metadata

Extend `WORKFLOW_PROMPT_META` with `analyze`, `matrix`, `publish` entries for the workflow picker.

### 5. Update the old-core note in `update.ts`

Change `displayOldCoreCustomProfileNote` to fire only when migration did **not** run and workflows still match old core—or remove it after migration handles the case. Prefer: delete obsolete note once auto-migration exists.

## Risks / Trade-offs

- **[Risk] User intentionally kept old OpenSpec core set** → They receive QASpec core on next init/update. **Mitigation:** Exact-set match only; log migration message; `qaspec config profile` can switch back to custom with explicit picks.
- **[Risk] Tests mutate real global config** → **Mitigation:** Mock `getGlobalConfig` / `saveGlobalConfig` or use temp config dir env override in tests.
- **[Risk] Partial installs (only some qas skills on disk)** → Out of scope; separate drift sync via `qaspec update`.

## Migration Plan

1. Ship CLI with auto-migration.
2. Users run `qaspec init` or `qaspec update` once; global config upgrades; artifacts regenerate including `qas-publish`.
3. No manual config edit required for the common legacy-core case.

## Open Questions

- None blocking implementation.
