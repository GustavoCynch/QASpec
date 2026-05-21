## Why

QASpec installs **agent skills** and **slash commands** for the same five QA workflows, but both families use the `qas` prefix (`qas-matrix` skill vs `/qas:matrix` command). In Cursor and similar tools, autocomplete lists them side by side and they read as duplicates. Upstream OpenSpec avoids this by using **`openspec-*` for skills** and **`opsx` for commands** (`/opsx:propose`). QASpec should mirror that split so users can distinguish “invoke workflow” (short slash) from “skill directory / skill picker” (product name).

## What Changes

- **Command prefix:** Rename generated slash commands from `/qas:*` to **`/qsx:*`** and command files from `qas-<id>` to **`qsx-<id>`** (analogous to `opsx`).
- **Skill prefix:** Rename skill directories and frontmatter from `qas-<workflow>` to **`qaspec-<workflow>`** (analogous to `openspec-*`).
- **Central constants:** Split `QASPEC_COMMAND_PREFIX` (`qsx`) from a new skill prefix (`qaspec`) in `qaspec-commands.ts` / `tool-detection.ts` / `skill-generation.ts`.
- **Templates and user copy:** Update workflow templates, init/update banners, welcome screen, reference scaffold, config seed hints, and docs to reference `/qsx:*` and `qaspec-*` skills.
- **Legacy cleanup:** Treat prior `qas-*` skills and `qas-*.md` commands as legacy artifacts removable on init/update; do not touch upstream `opsx-*` / `openspec-*`.
- **BREAKING:** Existing projects after `qaspec update` get new names; old `/qas:*` and `qas-*` paths are obsolete (migration via cleanup + docs).

## Capabilities

### New Capabilities

- `qsx-command-naming`: Short-prefix slash command file paths, frontmatter (`/qsx:<id>`), and cross-tool adapter conventions.

### Modified Capabilities

- `qas-workflows-and-commands`: Skill directory naming `qaspec-*`; slash commands `/qsx:*`; core profile unchanged (same five workflow ids).
- `command-generation`: File base `qsx-<id>`; colon slash names; Pi/OpenCode hyphen transforms from `/qsx:` to `/qsx-`.
- `qaspec-branding`: Agent slash references in docs/guards use `/qsx:*` not `/qas:*`.
- `legacy-cleanup`: Detect and remove legacy `qas-*` / `qas-*.md`; preserve `qsx-*` and `qaspec-*` as current QASpec surface.
- `cli-init` / `cli-update`: Success lines and quick-reference list `/qsx:*` workflows.
- `openspec-coexistence`: Coexistence summary wording distinguishes `qaspec-*` (QASpec) from `openspec-*` / `opsx-*` (upstream).

## Impact

- `src/core/qaspec-commands.ts`, `src/core/shared/tool-detection.ts`, `src/core/shared/skill-generation.ts`
- `src/core/templates/workflows/*.ts`, `src/core/profile-sync-drift.ts`, `src/utils/command-references.ts` (if qas→qsx transform needed)
- `src/core/legacy-cleanup.ts`, `src/core/init.ts`, `src/core/update.ts`, `src/ui/welcome-screen.ts`
- `src/core/reference-scaffold.ts`, `src/core/qa-config-seed.ts`, `docs/commands.md`, `docs/supported-tools.md`
- Tests: init/update snapshots, legacy-cleanup, branding/doc guards, command-generation fixtures
- User projects: `qaspec update` regenerates artifacts; optional cleanup prompt for old `qas-*` files
