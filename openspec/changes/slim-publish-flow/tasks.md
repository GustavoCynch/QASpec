# Tasks: Slim Publish Flow

## 1. Config support

- [ ] 1.1 In `src/core/project-config.ts`: parse optional `tcms` block (`provider`, `project`, `baseUrl` strings) with resilient field-by-field validation (warn and omit invalid fields; never fail load)
- [ ] 1.2 In `src/core/qa-config-seed.ts`: add commented `tcms` example block to the seeded config (provider/project/baseUrl placeholders plus a comment that publish persists it on first run); verify `serializeConfig` keeps the comments
- [ ] 1.3 Rewrite seeded `rules.apply` lines: config-target resolution, project discovery/creation, in-chat summary, single confirm halt; remove all `execution-context.md` / `publish-plan.md` lines

## 2. Schema and templates

- [ ] 2.1 Rewrite `apply.instruction` in `schemas/qaspec-pr-review/schema.yaml`: resolve target from config `tcms` (with discovery/creation and legacy `execution-context.md` migration paths), in-chat summary from unchecked cases, one confirm halt, MCP only after confirm, `publish-log.md` + checkbox marking unchanged; never write plan/context files; keep PII/secrets stop and read-only guardrails
- [ ] 2.2 Delete `schemas/qaspec-pr-review/templates/execution-context.md` and `templates/publish-plan.md`; update `templates/publish-log.md` if it references the plan file
- [ ] 2.3 Update `templates/analisis.md` / `templates/testcases.md` if they mention the removed files

## 3. Publish skill

- [ ] 3.1 Rewrite `src/core/templates/workflows/publish.ts` steps to the new flow: config target → (discovery/create + persist `tcms`, separate message) → summary → confirm → MCP → `publish-log.md` + `- [x]` marking; include graceful degradation when MCP lacks list/create project tools and the legacy `execution-context.md` migration offer
- [ ] 3.2 Check `qas-archive.ts` and `analyze.ts`/`cases.ts` bodies for mentions of `publish-plan.md` / `execution-context.md` and update them
- [ ] 3.3 Bump skill template versions touched (publish at minimum)

## 4. Docs

- [ ] 4.1 Update `docs/workflows.md`, `docs/commands.md`, `docs/getting-started.md`, `docs/concepts.md`: publish artifact table now `publish-log.md` only; document the `tcms` config block and first-run discovery/persistence; migration note for users who edited `publish-plan.md`
- [ ] 4.2 Update `README.md` and `website/` if they mention publish prepare files
- [ ] 4.3 Add CHANGELOG entry: removed prepare files, new `tcms` config block, migration notes

## 5. Tests and verification

- [ ] 5.1 Update suites referencing `publish-plan.md` / `execution-context.md` in schema instructions, templates listing, seed, and publish skill body
- [ ] 5.2 Add test: config with valid `tcms` block parses into ProjectConfig; invalid field type warns and is omitted; missing block loads clean
- [ ] 5.3 Add test: seeded config contains commented `tcms` example and `rules.apply` without prepare-file lines
- [ ] 5.4 Add test: schema templates directory contains `publish-log.md` but not `execution-context.md` / `publish-plan.md`; `apply.instruction` mentions `tcms` and not the removed files
- [ ] 5.5 Run `pnpm lint && pnpm build && pnpm test`
