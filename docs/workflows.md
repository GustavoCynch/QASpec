# Workflows

Common patterns for the QASpec **QA pipeline** and when to use each `/qsx:*` command. For setup, see [Getting Started](getting-started.md). For syntax, see [Commands](commands.md).

## Philosophy

QASpec treats testing work as **actions**, not rigid phases:

- Run `/qsx:analyze` when you need investigation, a signed-off analysis artifact, and delta specs
- Use normal chat for informal exploration before starting analyze
- Run `/qsx:cases` when you need test cases covering the approved specs
- Run `/qsx:publish` only after human approval
- Run `/qsx:archive` when the change is done

You can revisit earlier steps; halts exist where human judgment matters.

## Core profile (default)

`qaspec init` installs four workflows:

| Id | Slash command | Output |
|----|---------------|--------|
| `analyze` | `/qsx:analyze` | `analysis.md` + delta specs |
| `cases` | `/qsx:cases` | `testcases.md` (preconditions + steps per case) |
| `publish` | `/qsx:publish` | In-chat summary, then **Qase** upload after confirm; `publish-log.md` trace |
| `archive` | `/qsx:archive` | Archived change |

Typical happy path:

```text
/qsx:analyze ──► /qsx:cases ──► /qsx:publish ──► /qsx:archive
```

### Halts, gates, and prerequisites

The QA pipeline uses **CLI gates** so critical invariants are mechanically verified, not only prompt-enforced:

| Step | CLI gate | When |
|------|----------|------|
| After analyze halt | `qaspec approve analyze --change <name> [--head-sha <sha>]` | User approves the digest; records content hash + optional PR head SHA in `.qaspec.yaml` |
| Before cases halt | `qaspec validate cases --change <name>` | Every requirement has a covering case; every case has a `req` annotation; format lint passes |
| Before publish upload | `qaspec publish-gate --change <name>` | Approval valid, cases validation passes, usable per-change TCMS target (`qaspec tcms set`); emits `qaspec-gate:<token>` |

Check approval state anytime with `qaspec status --change <name> --json` — the `approval` block reports `valid`, `stale`, or `missing` for `qaspec-pr-review` changes.

- **Analyze → cases:** `analysis.md` and co-produced delta specs are the validated source of truth. Cases halts when `approval.analyze` is `stale` or `missing` and asks for re-approval via `/qsx:analyze`. Analyze ends with an **approval digest** (zero to three questions); after approval run `qaspec approve analyze`.
- **Cases → publish:** Every case requires `<!-- req: capability/slug -->`, `assumption:<id>`, or `gap`. Cases halts only after `qaspec validate cases` passes.
- **Publish summary → upload:** Run `qaspec publish-gate` before the in-chat summary. Cite the gate token with user confirmation before the first Qase MCP call. Write `publish-log.md` rows as **pending** before upload; reconcile on retry.
- **Legacy changes:** Changes created before the approval ledger have `approval: missing` — re-run analyze halt and `qaspec approve analyze` rather than failing hard.
- **Migration:** If you previously edited `publish-plan.md` before confirm, edit `testcases.md` instead. Legacy `execution-context.md` values are surfaced as an alternative in the target halt and, once chosen, persisted per change via `qaspec tcms set`.

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

Project seeds: `qaspec/references/historical_bugs.md`, `qaspec/references/qase_test_case_rules.md`.

## Workflow patterns

### Exploratory PR review

```text
/qsx:analyze ──► (approve) ──► /qsx:cases ──► (validate) ──► /qsx:publish ──► (publish-gate + confirm) ──► Qase upload
```

Use when a PR or requirement doc needs structured risk analysis before cases are written.

### Analysis only

```text
/qsx:analyze ──► stop (no cases yet)
```

Use when stakeholders need `analysis.md` before committing to a full case list.

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

Agents build preconditions and steps from `analysis.md`, the diff, requirements, and specs. Generic steps are allowed only when sources lack actionable detail (document with `<!-- gap: ... -->` or self-audit). Publish maps these blocks to Qase — it does not re-generate steps from titles alone.

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
