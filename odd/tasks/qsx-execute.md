# Feature: /qsx:execute — agent-driven browser execution of approved test cases

Objective: add an `execute` phase that runs a change's approved `testcases.md` in a real browser through an agent, decides pass/fail with deterministic checks, and surfaces only app defects to the human; the core stays project-agnostic.
Branch: `feat/qsx-execute`, stacked on `chore/adopt-odd` · Delivery: `ask-on-risk` · Test runner: `pnpm test` (vitest) · Status: implementation authorized (L11); in progress.

## Specs

**S1 — Project-agnostic core.** User: "no quiero que sea algo especifico para Cynch14, si no herramienta global, que pueda usarlo con mis otros proyectos y en el futuro considerar venderlo o mantenerlo opensource para la gente"
- Core code, generated skills/commands and seeds contain no project-specific value (URLs, origins, credentials, framework rules, tenant names). Those come only from `qaspec/config.yaml` (new `execution` block) and `qaspec/references/`.
- Acceptance: a test scans the generated execute skill/command bodies and the config seed for a denylist of adopter-specific strings (e.g. `cynch`, `orderstorm`, `WsService`) and finds none.
- Cynch is the first adopter only; its values live in the cynch14 repo's own `qaspec/config.yaml`.

**S2 — Goal.** User: "un flujo que no solo cubra planeación si no también la ejecución y el encontrar problemas, reduciendo al máximo el QA manual"
- `execute` consumes the approved `testcases.md` of a change, with the same preconditions publish relies on: valid analyze approval and `qaspec validate cases` passing.

**S3 — Browser execution by an agent.** User: "¿Cuál es la fase que ejecutaría las pruebas mediante agentes?, ¿o se descarta el uso del navegador?"
- The agent drives a real browser through Playwright MCP to run each case's Preconditions and Steps against the configured app URL.
- (D1) `qaspec init`/`update` writes the project-level Playwright MCP server entry, built from the `execution` config, for Claude Code and Cursor. Other agent tools get documented manual setup instead.

**S4 — App under test and readiness.** User (adopter example): "el npm start dentro de la rama usa ese staging"
- Config: `execution.app.url` and `execution.app.readiness` = `manual` (halt once and wait for the user to confirm the app is serving the change's code) or `probe` (HTTP GET to a configured URL must return 2xx).
- QASpec never starts the application or a dev server.

**S5 — Credentials.** User: "el usuario y contraseña los puedo meter en algun archivo gitignorado"
- Credentials are read only from a gitignored dotenv file; the variable names are configured.
- A project-provided login script (configured path) produces a browser storage state at a configured path. Playwright MCP starts with `--isolated --storage-state <path>`, so the agent never receives the password.
- `execute` halts with an actionable error when the credentials file or the storage-state path is not ignored by git.
- Playwright MCP `--secrets` is documented upstream as "a convenience and not a security feature"; it is not relied on.

**S6 — Network guard** (accepted proposal). `execution.network.blockedOrigins` (list) is passed to Playwright MCP `--blocked-origins`. Example: an adopter blocks its production backend origin.

**S7 — Pre-committed, deterministic verdicts** (accepted proposal; evidence: WebTestPilot 0.96 precision with code-evaluated assertions vs WebProber 85% false positives with LLM judgment).
- Before acting on a case, the agent writes an execution plan: actions plus checks derived from each Expected cell. Each check names where a value is read from (DOM extraction, network response, console, URL) and the condition it must meet.
- The plan is saved before execution and does not change during the run.
- After execution, a deterministic evaluator in the `qaspec` CLI (not the LLM) evaluates the checks against the captured state and produces pass/fail.
- An Expected that cannot be expressed as a check marks that step `needs-human`; such a case is never reported as passed.
- (D2) Checks are JSON with a fixed operator set: equals, contains, regex match, numeric comparison, and delta against the value captured before the action. The CLI never executes code written by the agent.

**S8 — Control case** (accepted proposal; evidence: Uber chaos testing pairs every run with a control run).
- `execution.controlCase` names a smoke case that runs at the start and at the end of each run. If either fails, the whole run is marked `environment-noise` and produces no findings.

**S9 — Environment readiness checks** (accepted proposal). User context: "el repo del backend (/Users/gustavovl/Repositories/wstest) siempre se despliega uan vez está listo y se va corrigiendo y redesplegando conforme de necesita"
- `execution.readinessChecks`: list of commands run before the cases. A non-zero exit marks the affected cases `blocked-by-environment`, not failed. Adopter example: verify a backend counterpart is deployed.

**S10 — Failure triage** (accepted proposal; evidence: GUITester actor/judge split, Meta JiT sense-check reach-outs).
- A failed case is retried once from a clean state.
- A fresh-context judge that did not drive the browser classifies a persisting failure as `agent`, `environment` or `app`, using the plan, trace, screenshots, console and network log.
- Only `app` failures become findings. Each finding is one sense-check question: what the case/spec expects, what was observed, and whether that is intended.
- (D4) When the agent tool cannot launch a subagent for the judge, `execute` stops with a clear error, as dual-analyst mode does. It never judges in the same context that drove the browser.

**S11 — TCMS results** (accepted proposal). After one confirmation halt (same pattern as publish), results are recorded in a TCMS run through the provider's MCP. Cases are matched by title, as publish re-runs already do. Wording stays provider-neutral.
- (D3) Publish keeps its 2.0 behavior and records no TCMS IDs. Each run stores its own case-title → TCMS-ID mapping inside its run directory.

**S12 — Test data traceability** (accepted proposal). Data the agent creates carries `execution.dataPrefix` plus the run id.

**S13 — Run artifacts** (accepted proposal). Each run writes `qaspec/changes/<name>/runs/<run-id>/` with plans, results, evidence, findings, and one ledger line per candidate (`candidate → rule-filtered → judge-filtered → reported → confirmed`, plus time to dismiss). Paths are built cross-platform (`path.join`).

**S14 — Original prompts.** Prompts are written for QASpec; nothing is copied verbatim from sources without a license (e.g. `mmaaz-git/agentic-pbt` has none).

**S15 — Process.** User: "dropeamos OpenSpec en Qaspec, ahora usaremos mi flujo de tareas ODD que ya tienes en el claude global."
- This feature is tracked in this document, not under `openspec/`.

**Out of scope** (later features of the same plan): `/qsx:catch`, `/qsx:pbt`, `/qsx:flows`, `/qsx:chaos`.

**Resolved decisions** (approved by the user 2026-10-19, see L10; folded into S3, S7, S10, S11):
- D1 — QASpec generates the Playwright MCP entry for Claude Code and Cursor; documented manual setup for other tools.
- D2 — JSON checks with fixed operators; no agent-written code is executed.
- D3 — Title matching stays; the title → TCMS-ID mapping lives in each run directory.
- D4 — Fail closed when no subagent is available for the judge.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S1, S4, S5, S6, S8, S9, S12 | `execution` config block: zod schema in `project-config.ts`, provider-neutral seed comment block, validation tests | inline | done | `c74685a` |
| T2 | S5 | Auth bootstrap: run the configured login script, write the storage state, gitignore guard | inline | done | `3b6412c`, `12b8f1b`, `a0a0581`, `afa5fef`, `5d78209` |
| T2-F1 | S5 | Follow-up: print a stderr hint when the interrupt cleanup cannot remove the session file (review `review-6dfa7c00a992738b` suggestion) | inline | pending | — |
| T3 | S3, S5, S6 | Playwright MCP entry for Claude Code and Cursor generated on `init`/`update`, launch arguments derived from config, manual-setup docs for other tools (D1) | inline | pending | — |
| T4 | S7 | Execution plan format and validator, JSON checks with fixed operators (D2) | inline | pending | — |
| T5 | S7 | Deterministic check evaluator command (D2) | inline | pending | — |
| T6 | S8, S9, S12, S13 | Run lifecycle: run directory, control case, readiness checks, single retry, ledger, run status command | inline | pending | — |
| T7 | S10 | Judge protocol in a subagent, fail closed without one, findings as sense-check questions (D4) | inline | pending | — |
| T8 | S11 | Results gate, TCMS run recording through MCP, per-run title → ID mapping (D3) | inline | pending | — |
| T9 | S1, S2, S3, S14 | `execute` workflow template, command/skill generation, core workflow set, parity snapshots, denylist test | inline | pending | — |
| T10 | S1–S15 | Docs: workflows, cli, getting-started, README | inline | pending | — |
| T11 | S1 | Dogfood: adopter config in cynch14 plus one real run; portability check on a second project | inline | pending | — |

Route evidence: inline by default; the units are sequential and no writer trigger holds yet. Revisit per task.
Risk forecast: T2 and T6 handle credentials and session files (high-risk item 2) → own commit and an independent verifier. T9 changes the core workflow set that installed projects consume (item 3).

## Log

- **L1** (2026-10-19, user, original request): "Leelos y dime, ¿cuál puedo integrar yo a mi flujo de trabajo? Actualmente trabajo con mi propia herramienta desarrollada completamente por mí: QASpec /Users/gustavovl/Repositories/QASpec , la cual no me molestaría deprecar y rehacer desde 0 si eso implica tener un flujo que no solo cubra planeación si no también la ejecución y el encontrar problemas, reduciendo al máximo el QA manual"
- **L2** (2026-10-19, user): "Lee completos los papers de las bug tech, los otros 2 repos que te pasé es algo más de aficionados. Quiero que te centres en los papers y me digas ya un plan más concreto"
- **L3** (decision): plan built on Meta (TestGen-LLM, ACH, JiT Catching, Harden and Catch), Anthropic (Agentic PBT) and Uber (AutoCover, DragonCrawl, chaos testing). Extend QASpec rather than rewrite it: its approved analysis and WHEN/THEN deltas supply the change intent Meta's JiT lacks (Meta inferred intent from PR title and summary only).
- **L4** (user): "¿Cuál es la fase que ejecutaría las pruebas mediante agentes?, ¿o se descarta el uso del navegador?" → per-PR execution (this feature) split from nightly flows and moved first.
- **L5** (user): "Sí, en staging tenemos una tienda de pruebas donde se puede hacer y deshacer lo que queramos, el usuario y contraseña los puedo meter en algun archivo gitignorado"
- **L6** (user): "En nuestro flujo de trabajo, el repo del backend (/Users/gustavovl/Repositories/wstest) siempre se despliega uan vez está listo y se va corrigiendo y redesplegando conforme de necesita, el npm start dentro de la rama usa ese staging" — verified: cynch14 `src/environments/environment.ts` sets `wsUrl` to the staging backend and `ng serve` has no configuration replacing it.
- **L7** (user): "Pero no quiero que sea algo especifico para Cynch14, si no herramienta global, que pueda usarlo con mis otros proyectos y en el futuro considerar venderlo o mantenerlo opensource para la gente"
- **L8** (user): "Sí" — to writing this spec together with the LICENSE fix.
- **L9** (user): "Por cierto, dropeamos OpenSpec en Qaspec, ahora usaremos mi flujo de tareas ODD que ya tienes en el claude global. Elimina la carpeta openspec del repo." → `openspec/` removed (633 tracked files, deletion staged on branch `chore/adopt-odd`); nothing outside it referenced the folder. LICENSE restores the upstream MIT notice "Copyright (c) 2024 OpenSpec Contributors" and adds "Copyright (c) 2026 QASpec Contributors".
- **L10** (2026-10-19, user): "Sí, lo apruebo" — approves the recommended D1–D4: generate the Playwright MCP entry for Claude Code and Cursor; JSON checks with fixed operators; keep title matching with a per-run ID mapping; fail closed without subagents. Folded into S3, S7, S10, S11 and T3, T4, T5, T7, T8.
- **L11** (2026-10-19, user): "Sí" — to committing `chore/adopt-odd` and starting implementation with T1. Commits `1ce9a71` (remove openspec folder) and `99ee4b5` (restore MIT notice) on `chore/adopt-odd`; RDD assessment against `3939452` (untracked `.atl/`, `.diagram/`, `odd/` excluded): risk medium, `review_due: false` (`under_budget`), pending in the slice. `feat/qsx-execute` created on top.
- **L12** (T1, `c74685a`): `src/core/execution-config.ts` holds the zod schema and a resilient per-field parser wired into `readProjectConfig`; `config-prompts.ts` seeds a commented, adopter-neutral `execution` example. Paths must be relative to the project root and stay inside it (POSIX and Windows absolute forms rejected explicitly) so T2 can check them with git. `blockedOrigins` entries are normalized to their origin. RED: 7 new tests failing before the change; GREEN: `test/core/project-config.test.ts` + `test/core/qa-config-seed.test.ts` 68/68, full suite 1491/1491, `tsc --noEmit` and eslint clean. Differential check (base `b4daa44` vs change, config with an `execution` block): `qaspec instructions analyze` and `qaspec status` stdout/stderr identical, exit 0. Risk: none (optional config field; existing config reading unchanged per the differential check). RDD assessment against `3939452`: medium, `under_budget`.
- **L13** (fix): the full suite exposed `test/specs/source-specs-normalization.test.ts`, which validated this repo's own `openspec/specs`; the L9 reference search missed it because it builds the path as `path.join(projectRoot, 'openspec', 'specs')`. Removed in `b4daa44` since the folder it validated no longer exists.
- **L14** (T2): `qaspec execute login [--json]` (`src/core/execution-auth.ts`, `src/commands/execute.ts`, docs in `docs/cli.md`). It runs the configured Node login script with the gitignored dotenv credentials plus `QASPEC_STORAGE_STATE`/`QASPEC_APP_URL`, and fails closed outside git, on tracked or non-ignored credential/session files, missing settings or variables, unsupported script types, and a session path equal to the credentials file. Credential values (≥4 chars, raw and JSON-escaped) are redacted; failed logins remove the session; the session is created owner-only before the script runs; the script runs in its own process group on POSIX with a 120 s timeout (SIGTERM, SIGKILL after 2 s), exit-grace settling, group cleanup, and SIGINT/SIGTERM/SIGHUP forwarding that removes the session. Risk: item 2 (credentials and session handling).
  - `3b6412c`: core plus command; RED by missing module, 13 core tests and 3 CLI tests GREEN; full suite 1507/1507; differential: `--help` only adds the `execute` line, `tcms`/`publish-gate` help identical.
  - Independent verifier (baseline `88123ee`, about 35 probe projects): items 1–6 PASS, no blockers, 9 advisories. `12b8f1b` fixes A1 (SIGKILL escalation, no wait on held pipes), A2 (JSON-escaped redaction), A3 (session removed on failure), A4 (same-file guard) and A8 (pin tests); A7 resolved by moving the docs section. A5 (inherited parent env, not new exposure), A6 (`--json` errors are plain text, as `tcms`) and A9 (Node 20 not run locally; CI covers it) remain advisories.
  - RDD review `review-3d92e2c664fff348` (base `88123ee`..`12b8f1b`, lenses risk/resilience/reliability, consent granted by the user): approved, acknowledged, authority burned. Advisory findings fixed in `a0a0581`: owner-only session during login (R1), exit-grace settling instead of a false timeout (R3-002/R4-001), process-group stop (R4-002), per-stream UTF-8 decoding for redaction (R3-003/R4-003); R3-001 (absolute paths) not reproducible because T1 rejects them, pinned by a test.
  - RDD review `review-17b5b5decf6964f5` (`12b8f1b`..`a0a0581`, lenses risk/resilience): approved, acknowledged. Both lenses found that the detached script no longer gets Ctrl+C/hangup; fixed in `afa5fef` with signal forwarding, RED reproduced as an orphaned script after SIGINT. Full suite 1520/1520.
  - L15 (2026-10-19, user): "Tienes mi consentimiento para hacer todas las revisiones rdd que a tu juicio, veas necesarias, no me preguntes de nuevo durante esta sesion" — standing RDD consent for this session.
  - RDD review `review-f06a831a53fabe98` (`a0a0581`..`afa5fef`, lenses risk/resilience, standing consent): approved, acknowledged. Fixed in `5d78209`: the docs now scope interrupt cleanup to POSIX (R1-001), and a failing cleanup no longer prevents re-raising the signal (R4; RED reproduced as exit code instead of SIGINT). Full suite 1521/1521.
  - RDD review `review-6dfa7c00a992738b` (`afa5fef`..`5d78209`, lens resilience): approved, acknowledged. One suggestion (stderr hint on failed cleanup) recorded as T2-F1 rather than opening another correction cycle.
- **Next:** T3.
