# Design: Remove Explore Step

## Context

The QASpec core profile installs five workflows (`explore`, `analyze`, `matrix`, `publish`, `archive`) defined in `CORE_WORKFLOWS` (`src/core/profiles.ts:14`). The explore workflow generates the `qaspec-explore` skill and `/qsx:explore` command via registry entries in `src/core/shared/skill-generation.ts` backed by `src/core/templates/workflows/qas-explore.ts`. Explore produces no artifact; `analisis.md` (analyze phase) is the declared source of truth for the matrix phase, so explore insights live only in chat.

Existing machinery relevant to this change:

- `removeUnselectedSkillDirs(skillsDir, desiredWorkflows, …)` in update already deletes skill directories for workflows not in the active list; an analogous path exists for command files.
- `OLD_CORE_WORKFLOWS = ['propose', 'explore', 'apply', 'archive']` (`profiles.ts:20`) detects legacy OpenSpec custom profiles and upgrades them to the QASpec core profile.
- `LEGACY_QAS_SKILL_DIR_NAMES` (`qaspec-commands.ts:15`) is the precedent for cleanup-by-constant of retired skill dirs.

## Goals / Non-Goals

**Goals:**

- Core profile ships exactly `analyze`, `matrix`, `publish`, `archive`.
- Init/update never generate explore artifacts and remove previously generated ones.
- Config handling stays resilient when existing user configs still list `explore`.
- All user-facing surfaces (CLI hints, welcome screen, docs, website) describe a four-step pipeline.

**Non-Goals:**

- Removing OpenSpec's change-planning explore mode used by maintainers in this repo (`/opsx:explore`, `openspec-explore`); that is upstream coexistence surface, not the QASpec product pipeline.
- Replacing explore with a different phase (e.g., a future execution/run phase) — separate change.
- Renaming `matrix` or reworking `publish` — separate proposals.

## Decisions

### D1: Drop `explore` from `CORE_WORKFLOWS`; keep it in `OLD_CORE_WORKFLOWS`

`CORE_WORKFLOWS` becomes `['analyze', 'matrix', 'publish', 'archive']`. `OLD_CORE_WORKFLOWS` is a *detection input* matching what legacy OpenSpec configs contain — it must keep `explore` or legacy upgrade stops matching. The upgrade target changes implicitly because it assigns `profile: core`.

*Alternative considered*: keeping `explore` as an installable-but-non-core workflow id. Rejected — it keeps the entire template/registry/test surface alive for a step with no artifact value.

### D2: Sanitize `explore` out of resolved workflow lists instead of erroring

Custom profiles in existing global configs may explicitly list `explore`. When resolving workflows for generation, unknown/retired ids are filtered with a one-line notice (reusing the existing unknown-id handling path in workflow resolution). Config load never fails because of a retired id. The notice points to `/qsx:analyze`.

*Alternative considered*: hard error forcing the user to edit config. Rejected — punishes users for our removal; init/update should self-heal like the legacy `qas-*` migration does.

### D3: Reuse the deselected-workflow cleanup for stale files

No new cleanup constant. Because `explore` is no longer in the desired workflow list, `removeUnselectedSkillDirs` (and the command-file equivalent) already removes `qaspec-explore` skill dirs and `qsx-explore` / `qsx/explore` command files on update for every configured tool. Init follows the same path it uses today for deselected workflows. Verify coverage with a test rather than adding a parallel mechanism.

*Alternative considered*: adding `qaspec-explore` to a retired-names constant like `LEGACY_QAS_SKILL_DIR_NAMES`. Only needed if the deselected cleanup turns out not to run in some init path — fallback, not first choice.

### D4: Delete the template module entirely

`src/core/templates/workflows/qas-explore.ts` is deleted along with its re-exports in `skill-templates.ts`, registry entries in `skill-generation.ts`, the `explore` mapping in `profile-sync-drift.ts`, the `qaspec-explore` entry in `tool-detection.ts`, and the `explore` workflow description in `commands/config.ts`. Dead code is removed, not stubbed.

### D5: Documentation and onboarding start at analyze

Welcome screen (`src/ui/welcome-screen.ts:24`), init success output (`init.ts:755`), update output (`update.ts:347`), migration hint (`migration.ts:159`), docs (`workflows.md`, `commands.md`, `getting-started.md`, `cli.md`), `README.md`, and the website pipeline section present `analyze → matrix → publish → archive`. The "think before the formal cycle" advice folds into analyze's description where useful.

## Risks / Trade-offs

- [Users who liked explore lose the mode] → Analyze already permits investigation before its single halt; docs note that free-form exploration is just a normal chat conversation — no command needed.
- [Deselected cleanup misses an init path or a tool layout] → Add e2e test: init a project with the old five-workflow layout on disk, run update, assert `qaspec-explore` dirs and `qsx` explore command files are gone for Claude and Cursor layouts.
- [Custom configs listing `explore` break generation] → D2 sanitization with notice; covered by a config-resolution test.
- [Upstream OpenSpec coexistence] → `openspec-explore` (upstream skill name in `upstream-coexistence.ts:14`) must remain untouched; cleanup must keep respecting the `upstreamOpenSpecActive` guard it already receives.

## Migration Plan

1. Ship removal in one release; `qaspec update` self-heals project files.
2. Global config: no schema change; retired id is filtered at resolution time (D2).
3. Rollback: revert the commit — template module and registry entries are self-contained.

## Open Questions

(none)
