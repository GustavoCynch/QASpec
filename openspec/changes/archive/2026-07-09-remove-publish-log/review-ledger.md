# Review Ledger — remove-publish-log

Judgment Day, Round 1 — 2026-07-09. Judges: jd-judge-a, jd-judge-b (blind, parallel). Target: uncommitted working-tree diff (12 files) vs delta specs.

| id | lens | location | severity | status | evidence |
|----|------|----------|----------|--------|----------|
| JD-001 | judgment-day | src/core/templates/workflows/publish.ts:20; src/core/qa-config-seed.ts:76 | WARNING | verified | Confirmed by both judges (A-001 ≡ B-002). Re-run reconcile clause omits the spec-required outcome "cases already present in Qase are marked `- [x]` without a duplicate create call" (delta scenarios "Re-run reconciles instead of duplicating" / "Interrupted publish resumes without duplicates"). Only schema.yaml:197 spells it out; the runtime skill body and seed rule — the surfaces agents actually receive — stop at "reconcile by title, never blind-create". Three teaching surfaces diverge. |
| JD-002 | judgment-day | CHANGELOG.md:63 | WARNING | verified | Judge A finding, verified by orchestrator. Unreleased "Slim publish flow" entry states "only `publish-log.md` is written after upload" — contradicts the checkbox-only flow shipping in the same unreleased cycle; no entry documents the removal. |
| JD-003 | judgment-day | schemas/qaspec-pr-review/schema.yaml:201; src/core/templates/workflows/publish.ts:25 | SUGGESTION | verified | Confirmed by both judges (A-003 ≡ B-001). Explicit "Do not write" guardrail lists execution-context.md and publish-plan.md but omits publish-log.md — the very file this change removes; the delta spec exclusion enumerates all three. |
| JD-004 | judgment-day | schemas/qaspec-pr-review/schema.yaml:197; src/core/templates/workflows/publish.ts:20 | WARNING | info | Judge A only, classified theoretical. Reconcile-by-title never explicitly directs the Qase MCP list/read (design.md's "one MCP read"); most agents infer it. Downgraded to INFO per warning rubric. |
| JD-005 | judgment-day | docs/concepts.md:707 | SUGGESTION | info | Judge B only (suspect). ASCII diagram PUBLISH row right border misaligned (width 81 vs 80-col box); pre-existing imperfection, change improved it by one column. Not fixed by user decision (cosmetic, single-judge). |
| JD-006 | judgment-day | website/src/site.ts:53 | SUGGESTION | info | Judge B only (suspect). `→ testcases.md ✓` checkmark glyph inconsistent with sibling WORKFLOW_COMMANDS entries and duplicates the Cases artifact target. Not fixed by user decision (cosmetic, single-judge). |
| JD-A-201 | judgment-day | CHANGELOG.md:63-64 | SUGGESTION | info | Round 2, Judge A. The edited "Slim publish flow" entry and the new "Publish log removed" entry overlap within the same Unreleased cycle; accurate but redundant. Non-blocking. |
| JD-B-201 | judgment-day | test/core/qa-config-seed.test.ts:193; test/core/templates/qas-workflow-bodies.test.ts:60 | SUGGESTION | info | Round 2, Judge B. The `(?! ,? or)` lookahead in the negative regex is functionally vestigial ("write" is never adjacent to publish-log.md in the enumeration) and would not exempt a reordered enumeration. Test-brittleness note, not a product defect. |

Contradictions: none. Judge A rated JD-001 real, Judge B theoretical; orchestrator resolved as WARNING (real) because the delta spec is binding and the terser wording is what generated skills ship.

Round 1 verdict: NOT approved — 2 real WARNINGs (JD-001 confirmed, JD-002 verified), fixes authorized by user.
Round 2 verdict (scoped re-review, both judges): JD-001, JD-002, JD-003 verified RESOLVED; 22/22 targeted tests green; regex revert-sensitivity empirically confirmed against historical write-ahead strings. Only SUGGESTION-level findings remain → reported as INFO per round-2 rule.

**JUDGMENT: APPROVED** — zero confirmed CRITICALs, zero confirmed real WARNINGs remaining. 2026-07-09.
