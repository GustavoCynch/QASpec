## 1. Config seed (qas-config-seed)

- [x] 1.1 Add `src/core/qa-config-seed.ts` with `getQaspecPrReviewConfigSeed()` — active `context` (role, read-only, language line, stack placeholders) and `rules` for `analyze`, `test-matrix`, `specs`, `apply` distilled from `.agents/skills/qa-pr-review/SKILL.md`
- [x] 1.2 Wire init config creation to merge seed when schema is `qaspec-pr-review` and config is new (preserve existing on extend)
- [x] 1.3 Unit tests: seed keys match artifact ids; serialized YAML parses; no unknown rule keys vs schema graph

## 2. Shared workflow preamble

- [x] 2.1 Add `src/core/templates/workflows/qas-workflow-preamble.ts` with config-injection contract (`instructions --json`, apply context/rules, do not copy into artifacts)
- [x] 2.2 Prepend preamble to `analyze.ts`, `matrix.ts`, `publish.ts`, `qas-archive.ts`; lighter variant for `qas-explore.ts`

## 3. Enrich qas-analyze / qas-matrix / qas-publish skills

- [x] 3.1 Expand `analyze.ts`: gh/git gathering, dual Task protocol, analyst prompt template, synthesis table, guardrails; reference `rules.analyze` not inline locale
- [x] 3.2 Expand `matrix.ts`: dual Task for case list, merge/dedupe rules, qase rules path, specs co-production, single halt
- [x] 3.3 Expand `publish.ts`: prerequisites halt, specs gate, PII stop (align `rules.apply`)
- [x] 3.4 Touch `qas-archive.ts` / `qas-explore.ts` for preamble consistency

## 4. Schema and artifact templates

- [x] 4.1 Enrich `schemas/qaspec-pr-review/templates/analisis.md` (sections per spec)
- [x] 4.2 Update `schemas/qaspec-pr-review/schema.yaml` `analyze` and `test-matrix` instruction blocks (dual analysts, checklist, no specs in analyze)
- [x] 4.3 Optionally enrich `testmatrix.md` template with traceability hint if missing

## 5. Documentation

- [x] 5.1 Update `docs/multi-language.md` — context vs rules vs references table; example full QA config
- [x] 5.2 Update `docs/customization.md` — editing seed rules; manual merge for existing projects

## 6. Verification

- [x] 6.1 Extend `test/core/init.test.ts` — new init config contains `rules.analyze` and role in `context`
- [x] 6.2 Extend `test/core/shared/skill-generation.test.ts` — analyze skill includes preamble, `instructions analyze`, `historical_bugs`, parallel Task
- [x] 6.3 Temp-dir smoke: `qaspec init` → verify `qas-analyze` skill + config seed + command file
- [x] 6.4 Run `pnpm test` for affected suites
