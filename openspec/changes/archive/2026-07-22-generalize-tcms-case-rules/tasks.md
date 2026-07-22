# Tasks: Generalize TCMS Case Rules

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300-380 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Rename + migrate + generalize + wire + docs (single deliverable) | PR 1 | `pnpm test -- reference-scaffold file-system init update` | `node build.js` then manual `qaspec init` / `qaspec update` in temp project | Revert this PR; no partial state — migration is additive-only, no data loss |

Single PR is appropriate: estimate is well under the 400-line default guard and far under the session's 800-line budget; `single-pr` strategy still requires an explicit `size:exception` before apply per policy.

## Phase 1: Foundation — moveFile helper

- [x] 1.1 RED — `test/utils/file-system.test.ts`: add tests for `FileSystemUtils.moveFile(src, dest)` — renames file preserving content; source missing rejects/throws.
- [x] 1.2 GREEN — `src/utils/file-system.ts`: add `static async moveFile(src: string, dest: string): Promise<void>` wrapping `fs.rename`.

## Phase 2: Migration core — reference-scaffold.ts

- [x] 2.1 RED — new `test/core/reference-scaffold.test.ts`: scaffold seeds `tcms_case_rules.md` (not legacy name) when neither file exists; asserts content includes conceptual mapping table (title/description-preconditions/steps action+expected/suite) and generic omit-on-unmapped wording; create-if-missing preserved when file exists.
- [x] 2.2 GREEN — `src/core/reference-scaffold.ts`: rename `REFERENCE_FILES.qaseRules` → `tcmsRules: 'tcms_case_rules.md'`; replace `ENGLISH_QASE_RULES` with generalized `ENGLISH_TCMS_RULES` per design (provider-neutral title, conceptual mapping table, generic omit-on-unmapped, Customize as per-provider extension point); update seeds array.
- [x] 2.3 RED — same test file, add migration cases (spec `qaspec-init-references` scenarios): legacy-only → renamed with byte-identical content; both-present → both untouched; new-only → no-op; neither → no-op; run twice → idempotent (second run no-op, no throw).
- [x] 2.4 GREEN — `src/core/reference-scaffold.ts`: add `RENAME_MAP` and export `async function migrateReferenceFilenames(projectRoot): Promise<string[]>` — check new-file-first, `FileSystemUtils.moveFile` only when legacy exists and new absent, swallow/log errors best-effort.

## Phase 3: Wiring — init.ts and update.ts

- [x] 3.1 RED — `test/core/init.test.ts`: assert `migrateReferenceFilenames` runs before `scaffoldQaspecReferences` (legacy file renamed, no duplicate seed).
- [x] 3.2 GREEN — `src/core/init.ts`: import and call `await migrateReferenceFilenames(projectPath)` immediately before line 135 (`scaffoldQaspecReferences`).
- [x] 3.3 RED — `test/core/update.test.ts`: integration test — legacy file present, all tools up-to-date (no `--force`) — assert migration renames legacy file BEFORE the up-to-date early return at line 152 fires.
- [x] 3.4 GREEN — `src/core/update.ts`: import and call `await migrateReferenceFilenames(resolvedProjectPath)` right after the planning-home existence check (after line 90), before tool-status/early-return logic.

## Phase 4: Reference sweep — source, schema, docs

- [x] 4.1 `src/core/qa-config-seed.ts` (l47, l66): replace `qase_test_case_rules.md` → `tcms_case_rules.md`.
- [x] 4.2 `src/core/templates/workflows/cases.ts` (l26, l31) and `src/core/templates/workflows/publish.ts` (l13): replace filename references, keep "e.g. Qase" wording where it names the MCP tool, not the file.
- [x] 4.3 `src/core/templates/workflows/qas-workflow-preamble.ts` (l125): replace filename reference.
- [x] 4.4 `schemas/qaspec-pr-review/schema.yaml` (l76, l96, l165, l195): replace filename references; generalize the l195 apply-instruction wording ("Send only Qase fields..." → provider-neutral).
- [x] 4.5 `README.md` (l26), `docs/getting-started.md` (l28), `docs/commands.md` (l63), `docs/workflows.md` (l73), `docs/multi-language.md` (l149): replace filename references.
- [x] 4.6 Verify `test/core/qa-config-seed.test.ts` (l82 `provider: qase`, l84 `https://app.qase.io`) is unaffected — confirmed unrelated to filename, no change needed.

## Phase 5: Final Validation

- [x] 5.1 Run `pnpm test` — full suite green, including new `reference-scaffold.test.ts`, updated `file-system.test.ts`, `init.test.ts`, `update.test.ts`.
- [x] 5.2 Run `node build.js` — build succeeds with no dangling `qase_test_case_rules` references (`grep -r qase_test_case_rules src schemas docs README.md` returns empty).
- [x] 5.3 Run `npx openspec validate generalize-tcms-case-rules --strict` — delta specs pass strict validation.
