## Context

QASpec ships five core `qas-*` skills generated from `src/core/templates/workflows/*.ts`. Each body is a short checklist. The archived `.agents/skills/qa-pr-review/SKILL.md` retains full QA methodology. The CLI already injects `qaspec/config.yaml` `context` (global) and `rules.<artifact-id>` via `generateInstructions()`; `openspec-propose`-style skills document applying those fields, but `qas-*` skills only mention language—not the full contract.

Consumers initializing with `qaspec-pr-review` get a minimal config seed (language placeholder only). Teams must manually port role and phase rules.

## Goals / Non-Goals

**Goals:**

- Three-layer split: config (role/rules) + schema (artifact contract) + skills (orchestration).
- Active QA config seed on first init for `qaspec-pr-review`.
- Enriched `analisis.md` template and analyze/matrix schema instructions.
- Thin but complete orchestrator skills with shared preamble and dual-analyst protocol for analyze/matrix.
- Tests and temp-dir smoke for seed + skill markers.

**Non-Goals:**

- Rewriting `qa-pr-review` reference pack or installing it via init.
- Auto-migrating existing consumer `config.yaml` on update.
- Moving `historical_bugs.md` / `qase_test_case_rules.md` content into config (stay under `qaspec/references/`).
- Kimi/other tool-specific Task APIs beyond documenting Cursor Task pattern.

## Decisions

### 1. Config owns role; skills own mechanics

**Choice:** Port Phase 1–4 *policy* into `context` + `rules.analyze|test-matrix|specs|apply`; keep Task×2, halt counts, file paths, and CLI steps in TypeScript templates.

**Rationale:** Matches `artifact-language-policy` and `context-injection` specs; teams edit stack/locale without fork releases.

**Alternative:** Embed full qa-pr-review in each skill → rejected (duplication, Spanish hardcoding risk, large tokens on every update).

### 2. Dedicated seed module

**Choice:** Add `src/core/qa-config-seed.ts` (or extend `config-prompts.ts`) exporting `getQaspecPrReviewConfigSeed(): Partial<ProjectConfig>` used by init when writing new config.

**Rationale:** Keeps `serializeConfig` comments for non-QA schemas; seed content is testable in isolation.

### 3. Shared preamble constant

**Choice:** `src/core/templates/workflows/qas-workflow-preamble.ts` exports `QAS_WORKFLOW_CONFIG_PREAMBLE` prepended to analyze/matrix/publish/archive bodies; explore gets a shorter variant.

**Rationale:** DRY; single place to update the `instructions --json` contract.

### 4. Analyst prompt as template string in analyze/matrix only

**Choice:** Include condensed analyst Task template in `analyze.ts` and `matrix.ts` (English), referencing `rules` + `historical_bugs` paths—not the full 560-line skill.

**Rationale:** Cursor-specific; must live in generated skill. Config cannot invoke Task.

### 5. Enriched analisis.md without locale in headings

**Choice:** English section headings in `schemas/qaspec-pr-review/templates/analisis.md`; body filled per config language.

**Rationale:** Existing `artifact-language-policy` allowance for structural English templates.

### 6. Init writes active rules

**Choice:** Uncommented `rules` arrays with ~5–15 bullets per artifact distilled from qa-pr-review (not commented examples).

**Rationale:** User confirmed init should ship ready-to-run defaults; teams trim/edit.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Config seed too opinionated (Angular/Cynch) | Use generic QA wording + editable placeholders in `context`; stack called out as example |
| Large generated SKILL.md on update | Preamble + phase body target &lt;150 lines each; policy in config |
| Agents skip `instructions --json` | Preamble step 1 mandatory; schema instruction repeats dependency |
| `rules` key typo | Seed uses validated artifact ids; unit test keys against schema graph |
| Existing projects unchanged | Document manual merge from seed in docs/customization.md |

## Migration Plan

1. Implement seed module + init wiring (new projects only).
2. Ship enriched schema templates and `schema.yaml` instructions.
3. Regenerate workflow templates; run init/update tests in temp dir.
4. Update docs (`multi-language.md`, `customization.md`).
5. No automated migration for existing repos; optional `qaspec config` doc snippet for copying seed block.

Rollback: revert template/seed commits; consumer config untouched.

## Open Questions

- Whether `qas-explore` should run `instructions` for a virtual artifact or only cite `context` (recommend: read config file or `qaspec config` output if added later; v1: mention `context` path in explore skill).
- Maximum bullet count per `rules` artifact before 50KB config pressure (monitor; split to `qaspec/references/qa-policy.md` only if needed in follow-up).
