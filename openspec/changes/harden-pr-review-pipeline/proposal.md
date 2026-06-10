# Harden PR Review Pipeline

## Why

An architecture audit of the qaspec-pr-review pipeline found that every critical guarantee — "validated", "covered", "published once", "not invented" — rests on prompt compliance with no mechanical verification. Approval is an assumed property of a file (no hash, no PR head SHA), coverage is self-graded by the same agent that drafted the cases, publish is a two-phase commit without a journal (retry duplicates Qase cases), and the Qase field mapping is open-world (severity/priority hallucination). One concrete bug: `templates/analysis.md` still forbids writing delta specs in analyze, contradicting the spec-first-analyze behavior shipped in `schema.yaml`.

## What Changes

- **Approval ledger**: new `qaspec approve <phase> --change <name>` records a SHA-256 of the approved artifacts plus the analyzed PR head SHA in change state; `qaspec status --json` reports `approval: valid|stale|missing` so the cases phase halts on drift instead of silently consuming unapproved or mutated artifacts.
- **Deterministic cases validation**: `<!-- req: capability/slug -->` traceability becomes mandatory on every case; new `qaspec validate cases --change <name>` parses delta spec scenarios and req annotations and fails on uncovered scenarios, dangling references, or checkbox/Steps format violations. The cases halt is forbidden until it passes.
- **Publish write-ahead log**: `publish-log.md` is written before MCP upload with per-case `pending → in-flight → done` status; on re-run the agent reconciles pending/in-flight rows against Qase by title/ID before creating — no blind re-creation.
- **Publish gate**: new `qaspec publish-gate --change <name>` verifies approval ledger, cases validation, and `tcms` config, then emits a one-time token the agent must cite with the user's confirmation before the first Qase MCP call.
- **Approval digest halt**: analyze ends with a compact digest (requirement headings + a new **Unvalidated assumptions** section ordered by risk) and 0–3 targeted questions; the forced single question is removed. **Validated clarifications** may only contain facts the user explicitly addressed.
- **Heterogeneous dual analysts**: when `multipleSubagents` is true, the two analysts get asymmetric briefs (intent-first without the diff vs implementation-first without the description); synthesis becomes a structural diff of predicted vs reconstructed behavior, and unique findings trigger a targeted verification instead of automatic confidence downgrade.
- **ABSENT-intent guard**: when the PR description and developer notes are missing or non-substantive, the agent records `Functional intent: ABSENT`, never reconstructs intent from the diff, and makes obtaining intent the first halt question.
- **Closed Qase field mapping**: the `qase_test_case_rules.md` seed is restructured around a mapping table (Qase field → source → default → allowed values); unmapped fields are omitted or sent with the documented default, never inferred; the confirm halt shows one representative full case payload.
- **Bug fix**: remove the stale `templates/analysis.md` comments that forbid writing `specs/**/*.md` in analyze.

## Capabilities

### New Capabilities

- `qas-approval-ledger`: recording and verifying phase approvals (content hash + PR head SHA) so downstream phases consume only artifacts the user actually approved.
- `qas-cases-validation`: deterministic coverage and format validation of `testcases.md` against the change delta specs.
- `qas-publish-gate`: mechanical precondition check and one-time token gating Qase MCP upload.

### Modified Capabilities

- `qaspec-pr-review-schema`: analyze halt becomes approval digest with Unvalidated assumptions; mandatory req traceability and validation gate in test-cases; publish-log becomes a write-ahead log with reconciliation; ABSENT-intent guard; stale template comment removed.
- `qas-workflows-and-commands`: qsx analyze/cases/publish skill bodies invoke approve/validate/publish-gate at the right steps; dual-analyst protocol becomes heterogeneous briefs with structural-diff synthesis.
- `qas-config-seed`: seeded `rules.*` updated to encode the new halt contract, traceability, gates, and intent guard.
- `qaspec-init-references`: `qase_test_case_rules.md` seed restructured around the closed field mapping table with omit-on-unmapped rule.

## Impact

- **CLI**: new commands `approve`, `validate cases`, `publish-gate`; `status --json` gains an `approval` block; change state file gains approval records.
- **Schema package**: `schemas/qaspec-pr-review/schema.yaml`, `templates/analysis.md`, `templates/testcases.md`, `templates/publish-log.md`.
- **Source**: `src/core/qa-config-seed.ts`, `src/core/reference-scaffold.ts`, `src/core/subagent-mode.ts`, `src/core/templates/workflows/{analyze,cases,publish,qas-workflow-preamble}.ts`, new core modules for ledger/validator/gate, command wiring in `src/cli`.
- **Docs/tests**: workflow docs and seed validation tests; new unit tests for ledger hashing, coverage parsing, and gate token flow.
- **Compatibility**: existing changes without approval records degrade gracefully (`approval: missing` → agent halts and asks rather than failing hard); no breaking CLI changes.
