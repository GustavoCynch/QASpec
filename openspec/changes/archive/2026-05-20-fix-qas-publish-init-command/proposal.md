## Why

Users who upgraded from pre-QASpec OpenSpec often have a global `custom` profile frozen at the old core workflow set (`propose`, `explore`, `apply`, `archive`). `qaspec init` and `qaspec update` honor that list, so they never install `qas-publish`, `/qas:publish`, or the analyze/matrix skills—even though the welcome screen and docs advertise them. Fresh inits then show legacy `/opsx:propose` guidance instead of the QASpec QA cycle.

## What Changes

- Auto-migrate global config when `profile: custom` workflows exactly match the legacy pre-QASpec core set to the current `core` profile (`explore`, `analyze`, `matrix`, `publish`, `archive`).
- Run the same migration from both `init` and `update` before workflow resolution (not only on extend-mode init).
- After migration, init/update SHALL generate `qas-publish` skill and `publish` slash command (e.g. `.cursor/commands/qas-publish.md`, `.claude/commands/qas/publish.md`).
- Refresh post-init "Getting started" so QASpec hints appear whenever the active workflow set includes QASpec QA ids (`analyze`, `matrix`, or `publish`), not only when `analyze` is present.
- Add workflow picker labels for `analyze`, `matrix`, and `publish` in `qaspec config profile`.
- Replace the outdated update note that mentions only `sync` with guidance about the QASpec core workflow set.
- Regression tests covering stale global config → full core QAS artifacts on init.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `cli-init`: Require QASpec core artifacts and messaging when the effective profile is core (including after legacy-profile migration); clarify success output rules.
- `command-generation`: Require `publish` command generation whenever the `publish` workflow is in the active profile (covered by existing registry; validated via migration tests).
- `qas-workflows-and-commands`: Require `qas-publish` install for core profile after legacy global-config migration.

## Impact

- `src/core/migration.ts` or `src/core/global-config.ts` — legacy profile upgrade helper
- `src/core/init.ts`, `src/core/update.ts` — invoke migration; getting-started condition
- `src/commands/config.ts` — `WORKFLOW_PROMPT_META` for QAS workflows
- `test/core/init.test.ts`, `test/core/update.test.ts` — stale-config regression tests
