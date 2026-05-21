## Context

`hasActiveUpstreamOpenSpec()` in `legacy-cleanup.ts` already detects upstream installs (`openspec/config.yaml`, `opsx-*` commands, or existing `openspec-*` skills) and skips **legacy cleanup**. Init/update still call `getSkillTemplates(workflows)` and unconditionally `FileSystemUtils.writeFile()` every template, including `openspec-propose` and `openspec-apply-change` from QASpec's forked templates (`generatedBy` from `@qaspec/cli` package version).

Upstream OpenSpec skills use the same directory names but different body content and author metadata (`metadata.author: openspec`). Overwriting breaks users who rely on upstream `/opsx:propose` and `/opsx:apply` behavior.

## Goals / Non-Goals

**Goals:**

- Reuse the existing coexistence guard; do not duplicate detection logic.
- Skip writes for all `openspec-*` skill dirs listed in `UPSTREAM_OPENSPEC_SKILL_NAMES` when upstream is active.
- Skip writes for `opsx-*` command files when upstream is active (same rationale as skills).
- Continue writing `qas-*` skills and `qas` / `qaspec` commands unchanged.
- Mirror behavior in `InitCommand.generateSkillsAndCommands` and both skill-generation paths in `UpdateCommand`.

**Non-Goals:**

- Merging or syncing upstream OpenSpec templates with QASpec templates.
- Detecting upstream vs QASpec per-file via `generatedBy` when coexistence guard is false (out of scope; guard is repo-level).
- Changing upstream OpenSpec CLI behavior.

## Decisions

### 1. Single guard at generation time

**Choice:** At the start of skill/command generation in init and update, call `hasActiveUpstreamOpenSpec(projectPath)`. If true, filter `skillTemplates` to exclude entries whose `dirName` is in `UPSTREAM_OPENSPEC_SKILL_NAMES`, and filter `commandContents` to exclude command IDs that map to upstream workflows only (`openspec-*` skills / `opsx-*` files).

**Rationale:** Same signals as cleanup guard; predictable; no partial overwrites.

**Alternative:** Compare `generatedBy` / `metadata.author` before each write — rejected: still overwrites when file missing; more I/O; design doc for isolation already chose repo-level guard.

### 2. Centralize filter helper

**Choice:** Add `filterTemplatesForUpstreamCoexistence()` (or similar) in `src/core/shared/` or export from `legacy-cleanup.ts` next to `UPSTREAM_OPENSPEC_SKILL_NAMES`, used by init and update.

**Rationale:** Two call sites in update; avoids drift.

### 3. User-visible feedback

**Choice:** When filtering removes templates, log one dim line per tool or once globally: e.g. `Upstream OpenSpec detected — left existing openspec-* skills and opsx-* commands unchanged`.

**Rationale:** Explains why fewer files were refreshed; matches coexistence prose requirement spirit.

### 4. Removal paths unchanged

**Choice:** When upstream is active, do not add new logic to **remove** stale `openspec-*` skills during profile shrink (update already may remove skills not in profile — must not delete upstream skills).

**Rationale:** Spec requires non-interference; review `removeSkillDirs` in update for openspec-* dirs when coexistence active.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| User wants QASpec to refresh forked `openspec-*` skills on top of upstream | Document `qaspec update --force` or manual delete; coexistence is intentional |
| Upstream active but user deleted one skill; init won't restore it | Acceptable; user manages upstream install |
| False positive: empty `openspec/` + accidental `openspec-propose` skill | Same as existing guard; requires config, opsx, or skill signal |
| Update removes upstream skills when narrowing profile | Gate `removeSkillDirs` to skip `UPSTREAM_OPENSPEC_SKILL_NAMES` when guard true |

## Migration Plan

- Ship in next CLI release; users re-run `qaspec init` safely — upstream skills preserved.
- Users already overwritten: restore from git or re-run upstream `openspec init` for affected tools.

## Open Questions

- Should we log skipped skill **names** in verbose mode only? Default: single summary line.
