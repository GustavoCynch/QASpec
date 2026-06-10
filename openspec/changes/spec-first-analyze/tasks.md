## 1. Schema instructions (schemas/qaspec-pr-review/schema.yaml)

- [ ] 1.1 Update `analyze` artifact instruction: read existing `qaspec/specs/<capability>/spec.md` for each affected capability, co-produce `specs/**/*.md` deltas with `analysis.md`, single halt covers both artifacts, clarifications update both; remove "no delta spec files in this step" and "Do NOT write specs" wording
- [ ] 1.2 Update `specs` artifact instruction: co-produced with `analysis.md` in the analyze phase, aligned with agreed behavior in `analysis.md` (drop "keep requirements aligned with testcases.md cases" coupling); keep delta format, baseline reading, and `requires: [analyze]`
- [ ] 1.3 Update `test-cases` artifact instruction: add `specs` to `requires`, read change delta specs as binding input, cover every requirement scenario with at least one case (self-audit before halt), remove the co-produce block and the dual-artifact halt (halt covers case list only)
- [ ] 1.4 Verify `apply.requires` stays `[test-cases, specs]` and publish instruction text needs no changes; run `openspec schema validate qaspec-pr-review` (or equivalent CLI validation)

## 2. Generated workflow skills/commands (src/core/templates/workflows/)

- [ ] 2.1 Update `analyze.ts` body: add baseline spec reading per affected capability, spec delta drafting before the halt, halt wording covering both artifacts, post-halt clarification updates to both; bump skill metadata version
- [ ] 2.2 Update `cases.ts` body: drop spec drafting and the dual-artifact halt; read change `specs/**/*.md` as binding input (preamble config artifact list becomes `['test-cases']` plus reading specs instructions only if still needed), add requirement-scenario coverage self-audit; bump skill metadata version
- [ ] 2.3 Check `qas-workflow-preamble.ts`, `publish.ts`, and `feedback.ts` for stale references to spec co-production in cases; update if any

## 3. Config seed (src/core/qa-config-seed.ts)

- [ ] 3.1 Move spec co-production rules from `rules.test-cases` to `rules.analyze` (drop "do not write specs/**/*.md ... in analyze"; add baseline reading and dual-artifact halt rules)
- [ ] 3.2 Update `rules.test-cases`: read approved delta specs as binding input, coverage self-audit, halt covers case list only
- [ ] 3.3 Update `rules.specs`: aligned with `analysis.md` agreed behavior; every scenario covered by at least one case in the cases phase

## 4. Docs

- [ ] 4.1 Update README.md and docs/ workflow descriptions (analyze produces analysis + specs; cases consumes specs) and CHANGELOG entry noting the breaking flow change and stale seeded rules in existing `qaspec/config.yaml` files

## 5. Tests

- [ ] 5.1 Update schema instruction assertions (test/commands/schema.test.ts, test/core/artifact-graph/instruction-loader.test.ts) for new analyze/test-cases/specs wording and `test-cases` requiring `specs`
- [ ] 5.2 Update workflow template tests (test/commands/artifact-workflow.test.ts and any skill-body tests) for new analyze/cases bodies
- [ ] 5.3 Update test/core/qa-config-seed.test.ts for moved rules
- [ ] 5.4 Run full suite (`pnpm test`) and build (`pnpm build`); fix regressions
