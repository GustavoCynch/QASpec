# Remove Explore Step

## Why

The `explore` step produces no artifact, and the QA pipeline declares `analisis.md` (owned by analyze) as the sole source of truth for the matrix phase — so any insight gathered during explore is lost unless the user re-enters it in analyze. The analyze phase already covers investigation: it reads the change set, assesses risks, and asks a clarification question. Keeping explore adds product surface (skill, command, docs, profile sync, drift checks, tests) without adding a step testers actually need.

## What Changes

- **BREAKING**: Remove the `explore` workflow from the QASpec core profile. The QA pipeline becomes `analyze → matrix → publish → archive`.
- `qaspec init` and `qaspec update` no longer generate the `qaspec-explore` skill or the `/qsx:explore` command for any configured AI tool.
- `qaspec init` and `qaspec update` remove previously generated `qaspec-explore` skill directories and `/qsx:explore` command files (same cleanup approach as legacy `qas-*` artifacts).
- Legacy global-config migration (OpenSpec custom set `propose, explore, apply, archive`) still triggers, but now maps to the four-workflow core set `analyze, matrix, publish, archive`.
- Init success output and getting-started hints start at `/qsx:analyze` instead of `/qsx:explore`.
- Migration assistance guidance in legacy cleanup points users to `/qsx:analyze`.
- Documentation (workflows, commands, getting started, CLI) and the website drop the explore step.

Out of scope: OpenSpec's own explore mode for change planning (`/opsx:explore`, `openspec-explore` skill) is a maintainer-facing planning tool in this repo and is not part of the QASpec product surface.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `qas-workflows-and-commands`: Core profile installs four workflow ids (`analyze`, `matrix`, `publish`, `archive`); the `qaspec-explore` skill requirement and explore guardrails requirement are removed; stale explore skills/commands are cleaned up on init/update.
- `command-generation`: The skill generation registry maps only `analyze`, `matrix`, `publish`, and `archive` to QASpec template getters; `explore` is no longer a recognized QASpec workflow id.
- `cli-init`: Success output and getting-started hints list `/qsx:analyze`, `/qsx:matrix`, `/qsx:publish` as next steps; legacy custom-profile upgrade results in the four-workflow core set.
- `legacy-cleanup`: Migration assistance references `/qsx:analyze` instead of `/qas:explore`.

## Impact

- **Deleted**: `src/core/templates/workflows/qas-explore.ts`; explore entries in skill/command template registries.
- **Modified**: `src/core/qaspec-commands.ts`, `src/core/profiles.ts`, `src/core/migration.ts`, `src/core/init.ts`, `src/core/update.ts`, `src/core/upstream-coexistence.ts`, `src/core/profile-sync-drift.ts`, `src/core/shared/skill-generation.ts`, `src/core/shared/tool-detection.ts`, `src/ui/welcome-screen.ts`, `src/commands/config.ts`.
- **Docs**: `docs/workflows.md`, `docs/commands.md`, `docs/getting-started.md`, `docs/cli.md`, `README.md`, `website/` (landing lists the step pipeline).
- **Tests**: All suites referencing `qaspec-explore` / `/qsx:explore` / workflow id `explore` (branding, cli-e2e, core, docs guards).
- **Users**: Existing projects lose `/qsx:explore` on next `qaspec update`; no artifact data is lost because explore never produced any.
