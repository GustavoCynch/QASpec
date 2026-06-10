# Tasks — Harden PR Review Pipeline

## 1. Approval ledger (qas-approval-ledger)

- [ ] 1.1 Create `src/core/approval-ledger.ts`: canonical content hashing (analysis.md + sorted specs/**/*.md, normalized line endings and `/` separators for hashing only), read/write `approvals.<phase>` records in the change `.openspec.yaml`
- [ ] 1.2 Add `qaspec approve analyze --change <name> [--head-sha <sha>]` command wiring in `src/cli` and `src/commands`, with confirmation output listing hashed artifacts
- [ ] 1.3 Extend `qaspec status --change --json` with the `approval` block (`valid|stale|missing`, reason `content-changed|head-moved`) for `qaspec-pr-review` changes; accept optional `--head-sha`
- [ ] 1.4 Unit tests: deterministic hash across mixed separators/CRLF fixtures, record write/read, stale-vs-valid-vs-missing detection, legacy change without `approvals` key

## 2. Cases validator (qas-cases-validation)

- [ ] 2.1 Create `src/core/cases-validation.ts`: parse `#### Scenario:`/`### Requirement:` keys from change specs (reuse `src/core/parsers/`), parse `testcases.md` checkboxes, `req:` annotations (`capability/slug`, `assumption:<id>`, `gap`), Preconditions/Steps structure
- [ ] 2.2 Implement failure rules (uncovered requirement, dangling reference, unannotated case, malformed checkbox/Steps) and scenario-level warnings; `--json` output
- [ ] 2.3 Add `qaspec validate cases --change <name>` command wiring (subcommand of existing validate or sibling, matching current CLI conventions)
- [ ] 2.4 Unit tests: coverage pass/fail matrix, annotation values, format lint, warning-only scenario gaps

## 3. Publish gate (qas-publish-gate)

- [ ] 3.1 Create `src/core/publish-gate.ts`: run approval check + cases validation + `tcms` block presence; on success persist nonce under `publishGate` in `.openspec.yaml` and print `qaspec-gate:<8-hex>` token derived from content hash + nonce
- [ ] 3.2 Add `qaspec publish-gate --change <name>` command wiring with enumerated failures and resolving commands
- [ ] 3.3 Unit tests: all-green token issuance, failure enumeration, token replacement on re-run, invalidation after artifact edit

## 4. Schema package updates (qaspec-pr-review-schema)

- [ ] 4.1 Fix `schemas/qaspec-pr-review/templates/analysis.md`: remove stale lines 7-8 forbidding specs in analyze; add `## Unvalidated assumptions` section with risk-ordering guidance; update halt comment to digest contract
- [ ] 4.2 Update `templates/testcases.md`: add `<!-- req: ... -->` annotation to the example case as mandatory
- [ ] 4.3 Update `templates/publish-log.md`: add Status column (`pending|in-flight|done|failed`) and write-ahead usage note
- [ ] 4.4 Update `schema.yaml` `analyze` instruction: digest halt (0–3 questions, no fabricated question), Unvalidated assumptions, Validated clarifications restricted to user-addressed facts, `qaspec approve analyze` after approval, ABSENT-intent guard
- [ ] 4.5 Update `schema.yaml` `test-cases` instruction: approval-state check before drafting (halt on stale/missing), mandatory `req` annotations, `qaspec validate cases` gate before halt with summary in halt message
- [ ] 4.6 Update `schema.yaml` `apply` instruction: `publish-gate` before summary, representative payload in summary, gate token cited with confirmation, write-ahead log flow, reconciliation on re-run, omit-on-unmapped fields rule

## 5. Workflow skill bodies (qas-workflows-and-commands)

- [ ] 5.1 Update `src/core/templates/workflows/analyze.ts`: digest halt steps, approve command step, ABSENT-intent guard, bump version
- [ ] 5.2 Update `src/core/templates/workflows/qas-workflow-preamble.ts`: replace identical dual-analyst protocol for analyze with heterogeneous briefs (intent-first without diff / implementation-first without description) and predicted-vs-reconstructed synthesis; cases analysts return drafts grouped by requirement slug with keyed-union merge
- [ ] 5.3 Update `src/core/templates/workflows/cases.ts`: approval-state check as step 1, mandatory annotations, validate-cases gate before halt, re-validate after edits, bump version
- [ ] 5.4 Update `src/core/templates/workflows/publish.ts`: gate step before summary, token citation, write-ahead rows, reconciliation rule, representative payload in summary, omit-on-unmapped rule, bump version
- [ ] 5.5 Update `src/core/subagent-mode.ts` appendix text for the heterogeneous analyze protocol and keyed cases merge

## 6. Seeds (qas-config-seed, qaspec-init-references)

- [ ] 6.1 Update `src/core/qa-config-seed.ts` rules: analyze (digest halt, approve command, ABSENT-intent), test-cases (approval check, req annotations, validate gate), apply (publish-gate + token, write-ahead + reconciliation, omit-on-unmapped)
- [ ] 6.2 Restructure `ENGLISH_QASE_RULES` in `src/core/reference-scaffold.ts` around the field mapping table (field → source → default → allowed values) with omit-on-unmapped statement

## 7. Tests and verification

- [ ] 7.1 Update existing seed/skill/schema tests asserting old wording (single halt question, optional req annotation, publish-log shape)
- [ ] 7.2 Add tests: skill bodies mention approve/validate/publish-gate commands; schema instructions include digest halt and gate steps; templates contain Unvalidated assumptions section and Status column
- [ ] 7.3 Run `openspec schema validate qaspec-pr-review`, full `pnpm test`, and `pnpm build`; fix regressions
- [ ] 7.4 Update docs (README/workflow docs) describing the approve/validate/publish-gate flow and migration note for legacy changes (`approval: missing` → re-approve)
