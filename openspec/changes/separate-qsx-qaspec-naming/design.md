## Context

- **Problem:** QASpec generates skills as `qas-<workflow>` and commands as `qas-<workflow>.md` with slash `/qas:<workflow>`. Cursor autocomplete surfaces both with nearly identical labels (e.g. `/qas-matrix` vs `/qas:matrix`).
- **Precedent:** Upstream OpenSpec uses **`openspec-*` skills** and **`opsx` commands** (`/opsx:<id>`, `opsx-<id>.md`). Short prefix for typing; product name for skill directories.
- **Today:** Single constant `QASPEC_COMMAND_PREFIX = 'qas'` in `src/core/qaspec-commands.ts`; `SKILL_NAMES` uses the same prefix in `tool-detection.ts` and `skill-generation.ts`.

## Goals / Non-Goals

**Goals:**

- Introduce **`qsx`** as the QASpec slash-command prefix (parallel to `opsx`).
- Introduce **`qaspec`** as the QASpec skill directory / skill `name` prefix (parallel to `openspec`).
- Centralize both prefixes in shared constants; adapters consume helpers (`qasCommandFileBase`, `qasSlashCommandName`, new `qaspecSkillDirName`).
- Update workflow template bodies that reference `/qas:` → `/qsx:`.
- Extend legacy cleanup to remove superseded `qas-*` skills and `qas-*.md` commands without touching `opsx-*` / `openspec-*`.
- Update docs, welcome screen, init/update hints, and tests.

**Non-Goals:**

- Renaming workflow ids (`explore`, `analyze`, …) — unchanged.
- Renaming CLI binary `qaspec` or planning directory `qaspec/`.
- Changing upstream OpenSpec artifacts.
- Auto-renaming in-place without `qaspec update` + optional legacy cleanup (no silent rewrite of user-edited command bodies beyond regeneration).

## Decisions

### 1. Prefix matrix (mirror OpenSpec)

| Artifact | Prefix | Example `matrix` |
|----------|--------|------------------|
| Skill directory + `name` | `qaspec` | `.cursor/skills/qaspec-matrix/SKILL.md` |
| Command file | `qsx` | `.cursor/commands/qsx-matrix.md` |
| Slash invocation (colon tools) | `qsx` | `/qsx:matrix` |
| Command frontmatter `id` | `qsx` | `qsx-matrix` |
| Claude/CodeBuddy subdir | `qsx` | `.claude/commands/qsx/matrix.md` |

**Rationale:** `qsx` is four characters like `opsx`, visually distinct from `qaspec` in autocomplete. `qas` alone collides with both.

**Alternatives considered:** `qasx` (closer to brand, still similar to `qaspec`); `qspec` (ambiguous). **Chosen:** `qsx`.

### 2. Split constants module

**Choice:** Extend `src/core/qaspec-commands.ts` (or rename to `qaspec-naming.ts`) with:

```ts
export const QASPEC_SKILL_PREFIX = 'qaspec';
export const QASPEC_COMMAND_PREFIX = 'qsx';

export function qaspecSkillDirName(workflowId: string): string;
export function qasCommandFileBase(commandId: string): string; // qsx-<id>
export function qasSlashCommandName(commandId: string): string; // /qsx:<id>
```

Keep function names stable where possible to limit adapter churn; behavior changes via constant values.

### 3. Legacy registry

**Choice:** Add explicit legacy patterns for the transitional `qas-*` / `qas-*.md` generation (bootstrap era). Current QASpec surface becomes `qsx-*` + `qaspec-*`. Detection uses registry lists, not broad regex.

**Rationale:** Matches `legacy-cleanup` design rules; avoids deleting upstream `opsx-*`.

### 4. Body reference transform

**Choice:** Update templates in `src/core/templates/workflows/*.ts` to say `/qsx:analyze`, etc. For Pi/OpenCode, ensure `transformToHyphenCommands` maps `/qsx:` → `/qsx-` (extend or duplicate existing `/qas:` handling).

### 5. Profile sync drift mapping

**Choice:** Update `profile-sync-drift.ts` workflow → skill dir map from `qas-matrix` to `qaspec-matrix`.

### 6. Documentation and guards

**Choice:** Replace `/qas:*` with `/qsx:*` in `docs/commands.md`, `docs/supported-tools.md`, branding guard (`product-docs-qas-commands.test.ts`), and `qaspec-branding` spec. Skills referenced as `qaspec-*` directories.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Users habituated on `/qas:*` | Migration note in init cleanup + docs; `qaspec update` regenerates |
| Missed hardcoded `qas-` strings in src | Grep guard test; archive change updates main specs |
| False positive legacy delete of user files named `qas-*` | Only delete paths from explicit legacy registry |
| Coexistence repos with both old and new | Cleanup offers removal of `qas-*`; install writes `qsx` + `qaspec` |

## Migration Plan

1. Ship code + spec deltas in this change.
2. Maintainers run tests; temp-dir init smoke expects `qsx-analyze.md` and `qaspec-analyze/`.
3. Users run `qaspec update` on each project.
4. On next init (or when legacy detected), confirm cleanup of `qas-*` skills and `qas-*.md` commands.
5. Update muscle memory: slash `/qsx:matrix`; skill picker shows `qaspec-matrix`.

**Rollback:** Revert release; users keep generated files until next update (no automatic downgrade of on-disk artifacts).

## Open Questions

- None blocking — prefix `qsx` is approved by product discussion in proposal thread.
