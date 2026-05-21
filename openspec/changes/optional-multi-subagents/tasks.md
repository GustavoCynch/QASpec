## 1. Config model and seed

- [x] 1.1 Extend `ProjectConfigSchema` and `readProjectConfig` in `src/core/project-config.ts` for `workflow.multipleSubagents.review` and `.matrix` (default false when absent)
- [x] 1.2 Add unit tests for valid, omitted, and invalid workflow flag parsing
- [x] 1.3 Seed `workflow.multipleSubagents` in `getQaspecPrReviewConfigSeed()` / `config-prompts.ts` with `review: false`, `matrix: false` and brief comment

## 2. Instruction injection and schema

- [x] 2.1 Inject subagent mode block in `instruction-loader.ts` for `analyze` and `test-matrix` based on parsed flags
- [x] 2.2 Add instruction-loader tests asserting orchestrator-only vs dual-analyst markers in JSON output
- [x] 2.3 Update `schemas/qaspec-pr-review/schema.yaml` analyze and test-matrix instructions to reference config flags instead of unconditional dual Task delegations
- [x] 2.4 Run `qaspec schema validate qaspec-pr-review`

## 3. Workflow templates and generated surfaces

- [x] 3.1 Refactor `qas-workflow-preamble.ts` — dual protocol vs orchestrator-only helpers keyed by phase flag
- [x] 3.2 Update `analyze.ts` and `matrix.ts` step lists to branch on `workflow.multipleSubagents` (read config in skill body)
- [x] 3.3 Trim or gate `rules.analyze` / `rules.test-matrix` dual-analyst lines in seed when flags default false (keep opt-in rule text for `true` teams)
- [x] 3.4 Run `qaspec update` and verify `.cursor/skills/qaspec-analyze`, `qaspec-matrix`, and `qsx-*` commands reflect new behavior

## 4. Docs, main specs, verification

- [x] 4.1 Document config example in `docs/workflows.md` or `docs/commands.md` (review/matrix flags, orchestrator-only vs dual)
- [x] 4.2 Archive change: merge deltas into `openspec/specs/qas-workflows-and-commands`, `qaspec-pr-review-schema`, `qas-config-seed`, `config-loading`
- [x] 4.3 Smoke: project with `review: false` — `qaspec instructions analyze --json` contains orchestrator-only guidance; with `review: true` — dual analyst guidance
