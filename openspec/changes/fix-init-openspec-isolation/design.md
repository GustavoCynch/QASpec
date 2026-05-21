## Context

QASpec forked OpenSpec’s init/update stack, including `legacy-cleanup.ts`. That module was built for **OpenSpec’s** one-time migration from pre-skill slash commands (`openspec-*`, directory-based commands) to agent skills and `opsx-*` commands. It also flags `openspec/AGENTS.md` and `openspec/project.md` as migration targets.

QASpec uses `qaspec/` as the default planning home (`QASPEC_DIR_NAME`) and installs `qas-*` skills/commands. Repos may also have a full **upstream OpenSpec** install under `openspec/` with `opsx-*` commands and OpenSpec skills — those are current, not legacy. Today `detectLegacyArtifacts()` treats them as legacy and `qaspec init` prompts to delete them.

## Goals / Non-Goals

**Goals:**

- `qaspec init` and `qaspec update` never prompt to remove or modify upstream OpenSpec files when OpenSpec is already installed.
- Legacy cleanup remains available only for **QASpec’s own** obsolete artifacts (e.g. old `qas-*` command files before skills, marker blocks QASpec wrote).
- Clear, QASpec-branded messaging when QASpec-specific legacy is cleaned (no “Upgrading to the new OpenSpec”).

**Non-Goals:**

- Changing upstream OpenSpec’s own `openspec init` behavior (this repo ships `qaspec` binary only).
- Migrating or merging `openspec/` content into `qaspec/` automatically.
- Uninstalling or upgrading OpenSpec on behalf of the user.

## Decisions

### 1. Coexistence guard: skip legacy cleanup when upstream OpenSpec is active

**Choice:** Add `hasActiveUpstreamOpenSpec(projectRoot)` and short-circuit `handleLegacyCleanup` in init/update when it returns true.

**Signals (all path joins via `path.join`):**

- `openspec/` directory exists, and
- At least one of:
  - `openspec/config.yaml` or `openspec/config.yml` exists
  - `.cursor/commands/opsx-apply.md` (or any file matching existing `opsx-*` command template IDs from `COMMAND_IDS` with `opsx-` prefix) exists
  - A skill under `.cursor/skills/openspec-propose/SKILL.md` (or other `openspec-*` skill from `SKILL_NAMES`) exists with `metadata.author` or `generatedBy` indicating OpenSpec (not `@qaspec/cli`)

**Rationale:** Explicit, cheap checks; matches the user’s reported repro (opsx commands + `openspec/AGENTS.md`). Avoids false positives on empty `openspec/` folders.

**Alternative considered:** Disable legacy cleanup entirely in QASpec — rejected because QASpec may still need to clean its own old `qas-*` command files after prior inits.

### 2. Narrow slash-command legacy patterns for QASpec

**Choice:** Remove `opsx-*` from `LEGACY_SLASH_COMMAND_PATHS` cursor/junie/opencode patterns when building detection for the QASpec CLI. Keep `qas-*` and `openspec-*` (pre-skill **old** OpenSpec format) only where they represent formats QASpec might have written during early fork usage.

**Rationale:** `opsx-*` files are **current** OpenSpec, not legacy. Deleting them breaks coinstalled OpenSpec.

**Alternative:** Keep patterns but filter detected files through coexistence guard — redundant if guard is solid; still narrow patterns so detection summary is not scary when guard fails.

### 3. Do not treat `openspec/AGENTS.md` as legacy when upstream OpenSpec is active

**Choice:** `detectLegacyStructureFiles` sets `hasOpenspecAgents` only when coexistence guard is false, OR when file contains QASpec-specific markers (if any). Default: if `hasActiveUpstreamOpenSpec`, do not flag `openspec/AGENTS.md` or `openspec/project.md`.

**Rationale:** Those files are part of the user’s OpenSpec setup, not QASpec migration debris.

### 4. User-facing copy

**Choice:** Replace `formatDetectionSummary` OpenSpec upgrade header with QASpec-specific text when invoked from QASpec paths, e.g. “Cleaning up old QASpec files” — and never show the block when coexistence guard triggers (no output).

**Rationale:** Users reported confusion from OpenSpec branding on a separate tool.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| False negative: skip cleanup when user actually has QASpec-written `opsx` files | Unlikely; QASpec uses `qas` prefix. Document `--force` behavior for power users. |
| False positive: empty `openspec/` skips needed QASpec cleanup | Require config or opsx/skills signal, not directory alone. |
| Repos with only legacy `openspec-*` commands, no `opsx` | Still clean `openspec-*` patterns; coexistence guard only when modern OpenSpec signals present. |

## Migration Plan

- Ship in next QASpec CLI release; no user migration steps.
- Users who already declined the bad prompt can re-run `qaspec init` safely.

## Open Questions

- Should `qaspec update` use the same guard? **Yes** — same detection module, same user expectation.
