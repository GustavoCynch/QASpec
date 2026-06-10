# Tasks: Cleanup Leftovers

## 1. Analysis artifact rename

- [x] 1.1 In `schemas/qaspec-pr-review/schema.yaml`: `analyze.generates` and template reference → `analysis.md`; update every `analisis.md` mention in instruction texts; fix `/qas:analyze` (line 18) → `/qsx:analyze`
- [x] 1.2 `git mv schemas/qaspec-pr-review/templates/analisis.md schemas/qaspec-pr-review/templates/analysis.md`; update mentions inside `testcases.md` and `publish-log.md` templates if present
- [x] 1.3 Add `'analysis.md': 'analisis.md'` to the legacy alias map in `src/core/artifact-graph/outputs.ts` with the rename notice; confirm dependency readiness and instruction loading use it (new name wins when both exist)
- [x] 1.4 Update skill bodies: `analyze.ts`, `cases.ts`, `publish.ts`, `qas-workflow-preamble.ts` (`QAS_CASES_ANALISIS_AUTHORITY` → `QAS_CASES_ANALYSIS_AUTHORITY` and its text); update `qa-config-seed.ts` rules mentioning `analisis.md`; bump touched skill template versions
- [x] 1.5 Update docs (`getting-started.md`, `workflows.md`, `commands.md`, `concepts.md`, `README.md` if applicable) and website (`Hero.astro`, `Install.astro`, `site.ts`) from `analisis.md` to `analysis.md`

## 2. Feedback alignment

- [x] 2.1 In `src/core/templates/workflows/feedback.ts`: skill body submits via `qaspec feedback` (command examples included), compatibility "Requires qaspec CLI", metadata author `qaspec`
- [x] 2.2 Verify `qaspec feedback` registers and works under the single binary (smoke: `qaspec feedback --help`)

## 3. Cosmetic leftovers

- [x] 3.1 Rename `QAS_EXPLORE_CONFIG_PREAMBLE` → `QAS_BASE_CONFIG_PREAMBLE` in `qas-workflow-preamble.ts` with heading `## Config`; update import in `qas-archive.ts`
- [x] 3.2 Fix `src/commands/config.ts:559` hint to current ids: "(analyze, cases, publish, etc.)"

## 4. Guard extension

- [x] 4.1 Extend the branding guard (or add a sibling test) to scan all generated skill and command template bodies from the registry for `openspec <subcommand>` instruction patterns, with an allowlist for legitimate upstream-coexistence prose
- [x] 4.2 Verify the guard fails on a fixture body containing `openspec feedback` and passes on allowlisted coexistence text

## 5. Tests and verification

- [x] 5.1 Update suites referencing `analisis.md` (schema, instruction-loader, seed, skill bodies, docs guards) to `analysis.md`
- [x] 5.2 Add test: change fixture with only `analisis.md` — `test-cases`/`specs` instructions resolve the analyze dependency from the legacy file with rename notice; new analyze writes `analysis.md`; both present → new name wins
- [x] 5.3 Add test: feedback skill template body contains `qaspec feedback` and no `openspec` CLI instruction
- [x] 5.4 Final sweep: `rg -n "analisis|/qas:|openspec feedback|Config \(explore\)|propose, explore" src/ docs/ schemas/ website/ test/` — triage every hit (legacy alias map entries and CHANGELOG/archive history stay)
- [x] 5.5 Run `pnpm lint && pnpm build && pnpm test`
