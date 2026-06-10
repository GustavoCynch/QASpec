# Workflows

Common patterns for the QASpec **QA pipeline** and when to use each `/qsx:*` command. For setup, see [Getting Started](getting-started.md). For syntax, see [Commands](commands.md).

## Philosophy

QASpec treats testing work as **actions**, not rigid phases:

- Run `/qsx:analyze` when you need investigation and a signed-off analysis artifact
- Use normal chat for informal exploration before starting analyze
- Run `/qsx:cases` when you need cases and delta specs
- Run `/qsx:publish` only after human approval
- Run `/qsx:archive` when the change is done

You can revisit earlier steps; halts exist where human judgment matters.

## Core profile (default)

`qaspec init` installs four workflows:

| Id | Slash command | Output |
|----|---------------|--------|
| `analyze` | `/qsx:analyze` | `analisis.md` |
| `cases` | `/qsx:cases` | `testcases.md` (preconditions + steps per case) + delta specs |
| `publish` | `/qsx:publish` | In-chat summary, then **Qase** upload after confirm; `publish-log.md` trace |
| `archive` | `/qsx:archive` | Archived change |

Typical happy path:

```text
/qsx:analyze ──► /qsx:cases ──► /qsx:publish ──► /qsx:archive
```

### Halts and prerequisites

- **Analyze → cases:** `analisis.md` is the validated source of truth for cases (especially **Validated clarifications** and intent vs implementation). Analyze must persist halt answers into that file; cases reads it before the PR diff and overrides the diff when they conflict.
- **Cases → publish:** Publish requires approved test cases and deltas; cases halts for case and requirement approval. Each case in `testcases.md` includes **Preconditions** and **Steps** under its checkbox line (built from sources, not invented).
- **Publish summary → upload:** Publish resolves the TCMS target from `tcms` in `qaspec/config.yaml` (or discovers/creates a Qase project on first run and persists the choice), presents an in-chat summary of unchecked cases, halts once for confirm, then runs **Qase MCP** only after confirmation and writes `publish-log.md`. v1 does not upload to TestRail, Xray, or other TCMS — more connectors are in progress; see [Test management (TCMS)](../README.md#test-management-tcms).
- **Migration:** If you previously edited `publish-plan.md` before confirm, edit `testcases.md` (source of truth) or state exclusions in chat instead. Legacy `execution-context.md` in a change is read once and offered for migration to config.
- **Cases without analyze:** Not supported — cases requires `analisis.md` from analyze.

Team policy lives in `qaspec/config.yaml` (`context`, `rules`, `workflow`). Generated `qaspec-*` skills stay thin and load policy via:

### Optional dual subagents per phase

By default both flags are **false** — the **orchestrator** (main agent) runs analyze and cases without Task subagents:

```yaml
workflow:
  multipleSubagents:
    review: false   # /qsx:analyze — PR analysis (analisis.md)
    cases: false   # /qsx:cases — testcases.md + delta specs
```

Set `review: true` and/or `cases: true` to restore **two parallel blind Task** analysts for that phase (synthesis merge as today). When a flag is false, do not delegate to even one subagent as a shortcut.

`qaspec instructions analyze --json` and `qaspec instructions test-cases --json` append a **Subagent mode** block reflecting the resolved flags.

```bash
qaspec instructions <artifact> --json
```

Project seeds: `qaspec/references/historical_bugs.md`, `qaspec/references/qase_test_case_rules.md`.

## Workflow patterns

### Exploratory PR review

```text
/qsx:analyze ──► /qsx:cases ──► (approve) ──► /qsx:publish ──► (confirm summary) ──► Qase upload
```

Use when a PR or requirement doc needs structured risk analysis before cases are written.

### Analysis only

```text
/qsx:analyze ──► stop (no cases yet)
```

Use when stakeholders need `analisis.md` before committing to a full case list.

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

Agents build preconditions and steps from `analisis.md`, the diff, requirements, and specs. Generic steps are allowed only when sources lack actionable detail (document with `<!-- gap: ... -->` or self-audit). Publish maps these blocks to Qase — it does not re-generate steps from titles alone.

### Custom profile (subset)

```bash
qaspec config profile   # Select a subset of the four workflows
qaspec update           # Regenerate skills/commands; remove deselected ones
```

Custom profiles only include QASpec workflow ids (`analyze`, `cases`, `publish`, `archive`). QASpec does not install legacy `propose`, `apply`, `sync`, or `/opsx:*` commands.

## Custom schemas

The default QA schema is `qaspec-pr-review`. Other schemas and artifact graphs are configured in `qaspec/config.yaml` — see [Customization](customization.md).

Legacy `/opsx:*` change scaffolding is **not** generated by `qaspec init`. Use `/qsx:*` for the default QASpec workflow.

## Related

- [Commands](commands.md) — Per-command reference
- [Concepts](concepts.md) — Planning home and changes
- [Supported Tools](supported-tools.md) — Install paths per AI tool
- [CLI](cli.md) — `qaspec list`, `validate`, `archive`
