# Archive Report: Generic TCMS Default and Neutral Publish

**Date**: 2026-07-22  
**Change**: generic-tcms-default-and-neutral-publish  
**Status**: ARCHIVED  
**Verdict**: PASS WITH WARNINGS (both resolved before archive)  
**Judgment Day**: APPROVED (0 findings)

## Executive Summary

Change `generic-tcms-default-and-neutral-publish` is fully implemented, verified (PASS WITH WARNINGS), JD-approved, and archived. The change makes QASpec's seeded TCMS configuration provider-neutral (absence of `provider` is the generic default) and completes the de-Qase wording sweep across templates, schema, seed rules, UI copy, and CLI text. No runtime-logic changes; purely textual. All 1483 tests pass. All implementation and specification requirements complete.

## What Was Delivered

Two coupled deliverables (no logic change):

1. **Provider-neutral seed**: Seeded `qaspec/config.yaml` footer is now a commented, provider-absent `tcms` example block with placeholder `YOUR_TCMS_PROVIDER` (not `provider: qase` / Qase baseUrl). Absence of `provider` is the documented generic default, driving existing publish step-7 halt-and-ask flow.

2. **De-Qase wording sweep**: Full MCP-only, provider-neutral wording across:
   - Gate hints (`publish-gate.ts`, `tcms.ts`) → `--provider <provider>` (not hardcoded `--provider qase`)
   - UI copy (`commands/config.ts`, `welcome-screen.ts`, `init.ts`) → "Publish to TCMS" (not "Publish to Qase")
   - Core templates (`publish.ts`, `cases.ts`, `qas-workflow-preamble.ts`, `analyze.ts`) → "TCMS MCP", "TCMS fields" (not Qase-branded)
   - Seed rules (`qa-config-seed.ts`) → provider-neutral apply rules
   - Schema (`schemas/qaspec-pr-review/schema.yaml`) → TCMS terminology
   - Docs (`workflows.md`, `commands.md`, `getting-started.md`, `multi-language.md`, `cli.md`, `concepts.md`, `README.md`)

**Scope OUT preserved**: No via/transport axis (MCP stays publish-only), no provider-model change, no qaspec-init-references migration wording.

## Verification & Judgment Day Status

**Verify Verdict**: PASS WITH WARNINGS

- `pnpm test` → 1483/1483 PASS (19.35s)
- `node build.js` → PASS
- `npx openspec validate generic-tcms-default-and-neutral-publish --strict` → VALID
- `rg -i qase src schemas docs README.md openspec/specs` → ONLY reference-scaffold.ts:20 (KEEP), reference-scaffold.ts:52 (illustrative), qaspec-init-references/spec.md (out-of-scope)

**Warnings** (both resolved):
- **W1** (delta/main divergence): Resolved. Delta specs were reworded during apply to match main specs' product-agnostic phrasing. All 8 MODIFIED requirement blocks now byte-identical to main.
- **W2** (PR delivery concern): Acknowledged by orchestrator as non-blocking (handled by orchestrator, not archive concern).

**Judgment Day**: APPROVED — 0 findings from both blind judges.

## Spec Sync Result

**Action**: NO-OP (per orchestrator directive: "deltas now byte-identical to main")

**Synced capabilities** (6 total, all MODIFIED-only, no ADDED/REMOVED):
- qas-config-seed → main spec
- qas-workflows-and-commands → main spec
- qas-publish-gate → main spec
- qas-tcms-target → main spec
- qaspec-pr-review-schema → main spec
- config-loading → main spec

**Verification**: All 6 deltas match corresponding main specs in `openspec/specs/`. Archive merge is idempotent.

## Archive Contents

Folder: `openspec/changes/archive/2026-07-22-generic-tcms-default-and-neutral-publish/`

```
.openspec.yaml                    (metadata: schema: spec-driven, created: 2026-07-22)
proposal.md                       (scope, locked decisions, scope-out)
design.md                         (architecture, wording convention, file changes, testing strategy)
tasks.md                          (8 phases, 25 checklist items — all [x] complete)
verify-report.md                  (verification results, gates, compliance)
specs/
  qas-config-seed/spec.md        (MODIFIED: seed docs tcms block, rules encode gates)
  qas-workflows-and-commands/spec.md (MODIFIED: cases/publish workflow behavior, TCMS discovery)
  qas-publish-gate/spec.md       (MODIFIED: gate verification, upload requires gate token)
  qas-tcms-target/spec.md        (MODIFIED: per-change storage, target resolution, absent=generic-default)
  qaspec-pr-review-schema/spec.md (MODIFIED: test-cases, publish artifact, provider-neutral apply)
  config-loading/spec.md         (MODIFIED: parse tcms defaults, open-string provider, absent=generic-default)
```

## Archived vs. Active State

**Before archive**: Active change in `openspec/changes/generic-tcms-default-and-neutral-publish/`  
**After archive**: All artifacts moved to `openspec/changes/archive/2026-07-22-generic-tcms-default-and-neutral-publish/`  
**Active directory status**: Removed (not present in `openspec/changes/`)

## Scope Carve-Outs (Preserved)

| Item | Status | Reason |
|------|--------|--------|
| qaspec-init-references migration | OUT | Owned by prior generalize-tcms-case-rules change |
| Via/transport axis (MCP vs CLI) | OUT | Publish stays MCP-only; no new transport |
| Provider-model change | OUT | `provider` already open string; no model change |
| reference-scaffold.ts:52 ("e.g. Qase's create_case") | KEEP | Illustrative example; locked decision |

## Traceability (Engram Observation IDs)

| Artifact | Type | Observation ID | Content |
|----------|------|---|---------|
| proposal | architecture | #1733 | Scope, locked decisions, capabilities, impact, risks |
| spec | architecture | #1735 | Delta spec summary, 6 MODIFIED capabilities, learned observations |
| design | architecture | #1734 | Technical approach, architecture decisions, wording convention, testing strategy |
| tasks | architecture | #1736 | 8 phases, 25 checklist items, forecast, work units |
| verify-report | architecture | #1738 | Verification gates, judgment day, deviations, learned observations |
| archive-report | architecture | THIS FILE | Change archived, specs synced, contents, traceability |

## Post-Archive Verification

Run before closing SDD cycle:

```bash
# Confirm delta is archived and not in active changes
npx openspec list
# Should NOT show generic-tcms-default-and-neutral-publish in output

# Confirm specs are synced and guard passes
rg -i qase openspec/specs
# Should return ONLY: qaspec-init-references/spec.md (line numbers)
# No matches in qas-config-seed, qas-workflows-and-commands, qas-publish-gate, 
# qas-tcms-target, qaspec-pr-review-schema, config-loading

# Confirm tests still pass
pnpm test
# Should show 1483/1483 passed
```

## SDD Cycle Complete

The change has been:
- Fully planned (proposal, design, tasks)
- Fully implemented (all 25 tasks [x] complete, all code changes made)
- Fully verified (PASS WITH WARNINGS, both warnings resolved)
- Judgment Day approved (0 findings)
- Fully archived (specs synced, folder moved, report filed)

Ready for next change.
