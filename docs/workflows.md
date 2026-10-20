# Workflows

Common patterns for the QASpec **QA pipeline** and when to use each `/qsx:*` command. For setup, see [Getting Started](getting-started.md). For syntax, see [Commands](commands.md).

## Philosophy

QASpec treats testing work as **actions**, not rigid phases:

- Run `/qsx:analyze` when you need investigation, a signed-off analysis artifact, and delta specs
- Use normal chat for informal exploration before starting analyze
- Run `/qsx:cases` when you need test cases covering the approved specs
- Run `/qsx:publish` only after human approval
- Run `/qsx:execute` after publish to run the approved cases in a real browser and report the results to your TCMS
- Run `/qsx:catch` after analyze when you want tests that catch regressions in a PR's code; it runs in parallel with cases, publish and execute
- Run `/qsx:archive` when the change is done

You can revisit earlier steps; halts exist where human judgment matters.

## Core profile (default)

`qaspec init` installs six workflows:

| Id | Slash command | Output |
|----|---------------|--------|
| `analyze` | `/qsx:analyze` | `analysis.md` + delta specs |
| `cases` | `/qsx:cases` | `testcases.md` (preconditions + steps per case) |
| `publish` | `/qsx:publish` | In-chat summary, then **TCMS** upload after confirm; checkbox marks in `testcases.md` |
| `execute` | `/qsx:execute` | Browser run of the approved cases; app findings as questions; TCMS results after confirm |
| `catch` | `/qsx:catch` | Catching tests run on the PR head; each likely regression as a question; landing patch after confirm |
| `archive` | `/qsx:archive` | Archived change |

Typical happy path:

```text
/qsx:analyze ──┬──► /qsx:cases ──► /qsx:publish ──► /qsx:execute ──► /qsx:archive
               └──► /qsx:catch (in parallel, once the analysis is approved with its PR head)
```

### Halts, gates, and prerequisites

The QA pipeline uses **CLI gates** so critical invariants are mechanically verified, not only prompt-enforced:

| Step | CLI gate | When |
|------|----------|------|
| After analyze halt | `qaspec approve analyze --change <name> [--head-sha <sha>]` | User approves the digest; records content hash + optional PR head SHA in `.qaspec.yaml` |
| Before cases halt | `qaspec validate cases --change <name>` | Every requirement has a covering case; every case has a `req` annotation; format lint passes |
| Before publish upload | `qaspec publish-gate --change <name>` | Approval valid, cases validation passes, usable per-change TCMS target (`qaspec tcms set`); emits `qaspec-gate:<token>` |
| Before an execute run | `qaspec execute start --change <name>` | Approval valid, cases validation passes, `execution` settings present, and, when `execution.auth` is set, credential and session files git-ignored; creates nothing when a gate fails |
| Before a catch run | `qaspec catch start --change <name>` | Approval valid with its `headSha`, intent class consistent, `catch` runner set, revisions resolved; creates nothing when a gate fails |
| Before TCMS results | `qaspec execute results-gate --run <id>` | Run finished, every `needs-triage` case judged, usable TCMS target; emits `results-gate:<token>` |

Check approval state anytime with `qaspec status --change <name> --json` — the `approval` block reports `valid`, `stale`, or `missing` for `qaspec-pr-review` changes.

- **Analyze → cases:** `analysis.md` and co-produced delta specs are the validated source of truth. Cases halts when `approval.analyze` is `stale` or `missing` and asks for re-approval via `/qsx:analyze`. Analyze ends with an **approval digest** (zero to three questions); after approval run `qaspec approve analyze`.
- **Cases → publish:** Every case requires `<!-- req: capability/slug -->`, `assumption:<id>`, or `gap`. Cases halts only after `qaspec validate cases` passes.
- **Publish summary → upload:** Run `qaspec publish-gate` before the in-chat summary. Cite the gate token with user confirmation before the first TCMS MCP call. Per case: MCP create → mark `- [x]` in `testcases.md`; on re-run, unchecked cases are reconciled against the TCMS by title before creating — never blind-create.
- **Execute:** `qaspec execute start` checks the same approval and validation gates as publish. With `execution.app.readiness: manual`, the run then halts once until you confirm that the app serves the change's code. Each failure is judged in a fresh subagent that did not drive the browser; when no subagent can be launched, the workflow stops and never judges in the browsing context. Only app defects become findings, and each is asked as a sense-check question. TCMS results need `qaspec execute results-gate` and one confirmation halt, and they match existing TCMS cases by exact title, so publish the cases first.
- **Catch:** `qaspec catch start` checks the approval, the intent class and the `catch` runner before it creates a worktree. Each finding is one question, and landing asks once. See [Catch tests for a PR](#catch-tests-for-a-pr).
- **Legacy changes:** Changes created before the approval ledger have `approval: missing` — re-run analyze halt and `qaspec approve analyze` rather than failing hard.
- **Migration:** If you previously edited `publish-plan.md` before confirm, edit `testcases.md` instead. A legacy `publish-log.md` from an earlier QASpec version is ignored. Legacy `execution-context.md` values are surfaced as an alternative in the target halt and, once chosen, persisted per change via `qaspec tcms set`.

Team policy lives in `qaspec/config.yaml` (`context`, `rules`, `workflow`). Generated `qaspec-*` skills stay thin and load policy via:

### Optional dual subagents per phase

By default both flags are **false** — the **orchestrator** (main agent) runs analyze and cases without Task subagents:

```yaml
workflow:
  multipleSubagents:
    review: false   # /qsx:analyze — PR analysis (analysis.md + delta specs)
    cases: false   # /qsx:cases — testcases.md
```

Set `review: true` and/or `cases: true` to restore **two parallel blind Task** analysts for that phase (synthesis merge as today). When a flag is false, do not delegate to even one subagent as a shortcut.

`qaspec instructions analyze --json` and `qaspec instructions test-cases --json` append a **Subagent mode** block reflecting the resolved flags.

```bash
qaspec instructions <artifact> --json
```

Project seeds: `qaspec/references/historical_bugs.md`, `qaspec/references/tcms_case_rules.md`.

## Workflow patterns

### Exploratory PR review

```text
/qsx:analyze ──► (approve) ──► /qsx:cases ──► (validate) ──► /qsx:publish ──► (publish-gate + confirm) ──► TCMS upload
```

Use when a PR or requirement doc needs structured risk analysis before cases are written.

### Analysis only

```text
/qsx:analyze ──► stop (no cases yet)
```

Use when stakeholders need `analysis.md` before committing to a full case list.

### Browser run of approved cases

```text
/qsx:publish ──► /qsx:execute ──► (confirm app) ──► run ──► judge ──► (answer findings) ──► (results-gate + confirm) ──► TCMS results
```

Use when the approved cases should run in a real browser and you want to hear only about application defects. The run needs the `qaspec-playwright` browser server (see [CLI](cli.md#browser-server-for-qsxexecute)) and credentials kept in a git-ignored file.

### PR catch

```text
/qsx:analyze (approve with --head-sha) ──► /qsx:catch ──► (answer findings) ──► (land: one confirmation) ──► you review and commit
```

Use when a PR's code change needs tests that catch regressions against its approved intent. The commands are in [CLI](cli.md#catch-commands).

### Enriched test cases format

Each case keeps one progress checkbox, with detail nested below:

```markdown
## Suite: Export

- [ ] 1.1 Export respects active filters

  **Preconditions:**
  1. On the staging environment
  2. Logged in as Analyst in Acme Corp
  3. At least ten records exist with filter "Status = Open" applied

  **Steps:**
  | # | Action | Expected |
  | 1 | Navigate to https://app.example/reports | |
  | 2 | Click "Export CSV" | Download starts |
  | 3 | Open the downloaded file | Row count matches the filtered list only |
```

Agents build preconditions and steps from `analysis.md`, the diff, requirements, and specs. Generic steps are allowed only when sources lack actionable detail (document with `<!-- gap: ... -->` or self-audit). Publish maps these blocks to your TCMS — it does not re-generate steps from titles alone.

### Custom profile (subset)

```bash
qaspec config profile   # Select a subset of the six workflows
qaspec update           # Regenerate skills/commands; remove deselected ones
```

Custom profiles only include QASpec workflow ids (`analyze`, `cases`, `publish`, `execute`, `catch`, `archive`). QASpec does not install legacy `propose`, `apply`, `sync`, or `/opsx:*` commands.

## Catch tests for a PR

`/qsx:catch` writes tests for the code that a PR changes, runs them on the parent and on the PR head, and asks you about each likely regression. The approved analysis is the oracle: its delta specs define the intended behavior, and the base specs that the deltas leave untouched define the behavior to keep. The commands are in [CLI](cli.md#catch-commands).

It runs after analyze, in parallel with cases, publish and execute, and it needs no `testcases.md`.

> **Trust.** The mutants and tests are code that the agent writes. They run with your permissions in a worktree outside the project, with no network or filesystem sandbox. Run it only on PRs whose tests you would run locally. See [Trust and containment](cli.md#trust-and-containment).

### Intent class

The analysis has an **Intent class** section with exactly one value. The class states what the change should do, and the delta specs must agree with it:

| Class | Delta specs | Use when |
|-------|-------------|----------|
| `refactor` | None | Behavior must not change |
| `additive` | ADDED only | New behavior; existing behavior stays |
| `behavior-change` | At least one MODIFIED, REMOVED or RENAMED | Existing behavior changes on purpose |

Catch refuses to start when the section is missing or when the class contradicts the deltas. An analysis approved before this section existed must be approved again, because adding the section changes the approval hash.

The class also tunes the questions. A report on a preserved requirement, or any report under `refactor`, is flagged `unexpected-for-intent`. A report on a modified requirement is flagged `possibly-intended`.

### Two phases

The worktree switches revisions once, so each phase runs against one stable revision: the parent, then the head.

1. **Parent phase (`ready`).** The agent records risks, one mutant per risk and the tests. A mutant must build and no existing test may catch it. A catching test must pass on the parent every time and fail on the mutated parent.
2. **Child phase (`catch child`).** The worktree moves to the PR head, reinstalls only when configured, and every gated test runs there. Each test is then classified.

Parent-phase commands refuse once the child phase has run.

### Classification

Each gated test gets one action from its parent and child outcomes (Harden and Catch, Table 3):

| Parent | Child | Action |
|--------|-------|--------|
| pass | pass | land |
| pass | fail | report |
| fail | pass | land |
| no build | pass | land |
| no build | fail | report |
| any | no build | signal |
| fail | fail | discard |

- **land:** a hardening test that passes on the head. You can take it.
- **report:** a likely regression. You get a question.
- **signal:** the head does not build, so the test says nothing about the change. It is reported as a signal, not as a finding.
- **discard:** the test fails on both sides, so the change did not cause it.

A timeout or runner error discards the test as inconclusive. Runs that disagree discard it as flaky, and a test that executes nothing on either side is discarded as vacuous. None of these is a finding.

### Findings

Each report that survives the rules and the judges becomes one question:

```text
Before: <what the parent did>. Now: <what the head does>. The scenario says: <THEN lines of its scenario, or "no scenario covers it">. Is this intended?
```

Answer each one with `qaspec catch answer`: a yes dismisses it, and a no confirms it. `qaspec catch status` reports the precision, which is the confirmed findings over confirmed plus dismissed findings.

Before a question reaches you, the run applies three filters:

1. **Generic rules:** environment failures, module or import errors in the test, mock misuse, not-implemented stubs, call-count expectations and order-only differences.
2. **Project rules** from `catch.rulesFile`. False-positive rules discard; true-positive rules only add a signal.
3. **Judges:** `catch.judges` fresh-context judges, which may only discard. A median score below zero discards the report.

The equivalence check and the judges run in fresh-context subagents, as `/qsx:execute` does. Without a subagent-capable tool, the workflow stops rather than judging in its own context.

### Landing

`catch land` writes the classified `land` tests into the run folder, with one patch against the PR head. The workflow lists the tests and the patch and asks once for confirmation. On yes it:

1. checks that your checkout is at the PR head;
2. runs `git apply --check` from the repository root, then `git apply`;
3. records the landing with `qaspec catch landed`.

QASpec never commits. You review the patch and commit it. A test whose path already exists on the head is refused and listed, and it is never overwritten.

### Degraded mode

`/qsx:catch` can run without an approved analysis, with `--without-analysis --head <sha>`. There is no intent, so the risks name changed files and functionality tests are not available. The tests are `dodgy-diff` tests or catching tests for mutants of those files, and every finding is marked low confidence. Use it when no analysis is approved yet and you accept weaker signals.

### Budget

By default the workflow writes at most 5 risks, 2 mutants per risk, 1 catching test per mutant, and 1 functionality test per added or modified scenario. Ask for more explicitly.

## Custom schemas

The default QA schema is `qaspec-pr-review`. Other schemas and artifact graphs are configured in `qaspec/config.yaml` — see [Customization](customization.md).

Legacy `/opsx:*` change scaffolding is **not** generated by `qaspec init`. Use `/qsx:*` for the default QASpec workflow.

## Related

- [Commands](commands.md) — Per-command reference
- [Concepts](concepts.md) — Planning home and changes
- [Supported Tools](supported-tools.md) — Install paths per AI tool
- [CLI](cli.md) — `qaspec list`, `validate`, `archive`
