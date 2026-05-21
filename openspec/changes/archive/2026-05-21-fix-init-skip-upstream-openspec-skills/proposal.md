## Why

The recent `fix-init-openspec-isolation` work stopped legacy cleanup from deleting upstream OpenSpec files, but `qaspec init` and `qaspec update` still **write** QASpec-packaged `openspec-*` skills (including `openspec-propose` and `openspec-apply-change`) over the user's existing upstream OpenSpec skills. Repos that already run upstream OpenSpec lose their skill content and `generatedBy` lineage after init.

## What Changes

- When `hasActiveUpstreamOpenSpec()` is true, skip generating or updating any `openspec-*` skill directories and `opsx-*` slash command files during init and update.
- Still install `qas-*` skills/commands and `qaspec/` planning home as today.
- Add regression tests: fixture with upstream `openspec/config.yaml` and pre-existing `openspec-propose` / `openspec-apply-change` skills retains original file content after init/update.
- Optionally surface a short log line that upstream OpenSpec skills/commands were left unchanged (no scary prompts).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `openspec-coexistence`: Extend non-interference to **writes** (not only delete/cleanup) for upstream `openspec-*` skills and `opsx-*` commands.
- `cli-init`: Skill/command generation scenarios when upstream OpenSpec is active.
- `qas-workflows-and-commands`: Align workflow install rules with coexistence (no overwrite of upstream workflow artifacts).

## Impact

- `src/core/legacy-cleanup.ts` — export or reuse `UPSTREAM_OPENSPEC_SKILL_NAMES` / coexistence helpers for generation paths
- `src/core/init.ts` — filter skill/command templates before write when upstream active
- `src/core/update.ts` — same filter in both skill refresh code paths
- `test/core/init.test.ts`, `test/core/update.test.ts` — coexistence write preservation tests
- `openspec/specs/openspec-coexistence/spec.md` — delta via change specs
