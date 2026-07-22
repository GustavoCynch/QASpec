# Design: Generalize TCMS Case Rules

## Technical Approach

Rename the scaffolded reference `qaspec/references/qase_test_case_rules.md` → `tcms_case_rules.md` and generalize its seed content, while shipping a **content-preserving rename migration** reachable from BOTH `qaspec init` and `qaspec update`. The migration is a small, standalone, idempotent function that renames legacy→new only when the new file is absent, never overwriting user content. Provider model is unchanged (`TcmsTarget.provider` is already an open string). Maps to proposal capabilities `qaspec-init-references`, `cli-init`, `qas-workflows-and-commands`, `qaspec-pr-review-schema`, `artifact-language-policy`.

## Architecture Decisions

### Decision: Shared standalone migration function (not scaffold-embedded)

**Choice**: Export `migrateReferenceFilenames(projectRoot): Promise<string[]>` from `src/core/reference-scaffold.ts`, driven by a rename map. Call it from `init.ts` (before `scaffoldQaspecReferences`) and from `update.ts` (early in `execute`).
**Alternatives considered**: (a) embed rename inside `scaffoldQaspecReferences` and also call the scaffold from update; (b) init-only migration.
**Rationale**: The scaffold is create-if-missing and tool-agnostic; update never calls it and should not start seeding scaffold files as a side effect. A separate unit is the smallest testable seam and keeps rename (mutating) distinct from seed (create-only). Init-only migration strands update-only users on the legacy filename — rejected.

### Decision: New `FileSystemUtils.moveFile` helper

**Choice**: Add `static async moveFile(src, dest)` wrapping `fs.rename` in `src/utils/file-system.ts`.
**Alternatives considered**: inline `fs.rename` in the migration (as `init.ts`/`update.ts` inline `fs.promises.rm`).
**Rationale**: No rename/move API exists today. A thin helper gives a mockable seam for tests and keeps `reference-scaffold.ts` on the `FileSystemUtils` surface it already uses.

### Decision: Ordering — migrate before scaffold / before update short-circuits

**Choice**: In `init.ts`, insert `await migrateReferenceFilenames(projectPath)` immediately before line 135 (`scaffoldQaspecReferences`). In `update.ts`, insert it right after the planning-home existence check (after line 90), before tool config is read and before the up-to-date early return (line 152).
**Rationale**: Init — after rename the scaffold sees the new file and skips re-seeding (no duplicate). Update — the reference file is independent of tool version status; placing migration before the `toolsToUpdateSet.size === 0` early return guarantees up-to-date and `--force`-less users are still migrated.

## Rename Semantics (state table)

Precondition order: **check the new file first** — if it exists, never touch legacy.

| legacy exists | new exists | Action |
|---------------|-----------|--------|
| yes | no  | `moveFile(legacy → new)` — preserves user content |
| yes | yes | no-op (leave both untouched) |
| no  | yes | no-op |
| no  | no  | no-op (scaffold create-if-missing seeds new) |

Idempotent: after a successful rename, legacy is gone and new exists → every later run hits "new exists → no-op". Errors are swallowed/logged (best-effort, like existing cleanup) so a locked/edge-case file never aborts init/update.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/reference-scaffold.ts` | Modify | `REFERENCE_FILES.qaseRules` → `tcmsRules: 'tcms_case_rules.md'`; `ENGLISH_QASE_RULES` → `ENGLISH_TCMS_RULES` (generalized); add exported `migrateReferenceFilenames` + `RENAME_MAP` |
| `src/utils/file-system.ts` | Modify | Add `moveFile(src, dest)` helper |
| `src/core/init.ts` | Modify | Call `migrateReferenceFilenames` before `scaffoldQaspecReferences` (l135); success hint wording neutral |
| `src/core/update.ts` | Modify | Import + call `migrateReferenceFilenames` after planning-home check (post-l90) |
| `qa-config-seed.ts`, `templates/workflows/{cases,publish,qas-workflow-preamble}.ts`, `config-prompts.ts`, `commands/tcms.ts` | Modify | Filename refs + provider-neutral wording (keep "e.g. Qase" where publish examples stay) |
| `schemas/qaspec-pr-review/schema.yaml` | Modify | Filename + apply-instruction wording |
| `README.md`, `docs/*.md` | Modify | Filename references |

## Interfaces / Contracts

```ts
// reference-scaffold.ts
export const REFERENCE_FILES = { historicalBugs: 'historical_bugs.md', tcmsRules: 'tcms_case_rules.md' } as const;
const RENAME_MAP: ReadonlyArray<{ legacy: string; current: string }> =
  [{ legacy: 'qase_test_case_rules.md', current: 'tcms_case_rules.md' }];
export async function migrateReferenceFilenames(projectRoot: string): Promise<string[]>; // returns renamed relative paths
```

`ENGLISH_TCMS_RULES` seed shape (body written in apply): provider-neutral H1 (e.g. "TCMS test case rules"); intro naming the generic MCP publish step (neutral / "e.g. Qase"); **conceptual** mapping table with rows `title | description (Preconditions) | steps (Action) | expected (Steps Expected) | suite` and generic omit-on-unmapped rule ("Any TCMS field not listed… MUST be omitted or sent with documented default"); unchanged Suites/Cases/Structure/Preconditions sections and `<!-- req: -->` guidance; **Customize** section restated as the per-team/per-provider extension point ("plug in your provider's concrete field codes").

## Testing Strategy (TDD)

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `moveFile` renames and surfaces/handles errors | vitest, temp dir |
| Unit | scaffold seeds `tcms_case_rules.md` when neither file exists | temp dir, assert content |
| Unit | migration: legacy→new when new absent, **content preserved** | write custom body, migrate, assert identical |
| Unit | migration: both-present → both untouched; neither → no-op | temp dir |
| Unit | idempotency: run migration twice → stable, no throw | temp dir |
| Integration | `update.execute` runs migration even when tools up-to-date | spy on `migrateReferenceFilenames` / assert legacy renamed |

RED tests first for each row; no existing test references the filename, so these are net-new.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The change performs an in-project file rename via `fs.rename` only.

## Migration / Rollout

One-time, self-healing on next `init` or `update`. No flag, no version gate, no user action. Legacy filename disappears after first successful run; re-runs are no-ops.

## Open Questions

- [ ] None blocking. (Deferred by proposal: full de-provider-ization of publish-flow wording — out of scope.)
