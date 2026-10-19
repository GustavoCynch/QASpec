# Commands

Reference for QASpec **slash commands** installed by `qaspec init` and `qaspec update`. Invoke them in your AI assistant (Cursor, Claude Code, Windsurf, etc.).

For workflow patterns, see [Workflows](workflows.md). For terminal commands, see [CLI](cli.md).

> **Not installed by QASpec:** legacy upstream slash-command workflows and third-party skill packs. QASpec ships `/qsx:*` commands via `qaspec init`.

## Quick Reference (core profile)

| Command | Purpose |
|---------|---------|
| `/qsx:analyze` | Create `analysis.md` and change delta specs (risk, capabilities, dual review) |
| `/qsx:cases` | Create `testcases.md` covering the approved delta specs |
| `/qsx:publish` | Publish approved cases to your **TCMS** (any MCP-backed provider) |
| `/qsx:execute` | Run approved cases in a real browser, judge failures, and report results to your **TCMS** |
| `/qsx:archive` | Finalize and archive the change |

Workflow ids: `analyze`, `cases`, `publish`, `execute`, `archive`. Customize subsets with `qaspec config profile` (custom profile only selects among these five).

Informal investigation happens in normal chat or at the start of `/qsx:analyze`.

---

## `/qsx:analyze`

Produce **`analysis.md`** and co-produced **delta specs** for the active change: risks, affected capabilities (kebab-case), and requirements for agreed testable behavior.

**Syntax:**

```text
/qsx:analyze [change-name-or-description]
```

**What it does:**

- Creates or updates a folder under `qaspec/changes/<change>/`
- Writes `analysis.md`; reads `qaspec/references/historical_bugs.md` when present
- Reads existing `qaspec/specs/<capability>/spec.md` for each affected capability (previously agreed behavior)
- Writes or updates `specs/<capability>/spec.md` deltas in the same phase
- Ends with a **halt** covering both `analysis.md` and the delta specs; answers update **Validated clarifications** and the affected specs before `/qsx:cases`

**CLI support:**

```bash
qaspec instructions analyze --json
```

---

## `/qsx:cases`

Produce **`testcases.md`** with mandatory checkboxes covering the approved delta specs.

**Syntax:**

```text
/qsx:cases [change-name]
```

**Prerequisites:**

- Prior `/qsx:analyze` with approved `analysis.md` and delta specs unless you explicitly accept gaps
- Reads `qaspec/references/tcms_case_rules.md` when publishing to your TCMS later
- Reads `qaspec/specs/<capability>/spec.md` for capabilities listed in `analysis.md`

**What it does:**

- Treats approved `analysis.md` and the change delta specs as source of truth (over PR diff when they conflict)
- Covers every requirement scenario in the delta specs with at least one case
- Halts once for approval of the case list

---

## `/qsx:publish`

Prepare and upload **approved** test cases from `testcases.md` to your TCMS via MCP. `provider` is an open string, so any MCP-backed TCMS works; installer-side connector selection for specific systems is still in progress — see [Test management (TCMS)](../README.md#test-management-tcms) to collaborate on the roadmap.

**Syntax:**

```text
/qsx:publish [change-name]
```

**Prerequisites:**

- Approved delta specs from `/qsx:analyze` and approved `testcases.md` from `/qsx:cases`
- Agent directs you back to the missing phase if artifacts are missing

**What it does:**

1. Resolves the TCMS target for the change (`qaspec tcms show`): the `tcms` block in the change's `.qaspec.yaml`, with `qaspec/config.yaml` `tcms` as optional user-managed defaults.
2. When no usable target exists, proposes **creating a new TCMS project** for the change (recommended), lists existing projects only as alternatives, and halts for your choice — an existing project is reused only when you explicitly pick it. Your choice is persisted per change with `qaspec tcms set`; the agent never writes `tcms` into `qaspec/config.yaml`.
3. Presents an in-chat publish summary (target, suites, unchecked-case counts, warnings) and halts once for confirm — **no TCMS upload in that message**.
4. After you confirm, uploads via MCP and marks each published row `- [x]` in `testcases.md` immediately after its successful create call; on re-run, unchecked cases are reconciled against the TCMS by title before creating.

**Per-change TCMS target** (change `.qaspec.yaml`, written by `qaspec tcms set`):

```yaml
tcms:
  provider: your-tcms-provider
  project: PR415
  baseUrl: https://your-tcms.example.com
```

Project codes and base URLs often vary per PR or tenant, so the target lives with the change. Teams with one fixed target can uncomment the `tcms` defaults block in `qaspec/config.yaml` (user-managed; publish never writes it). If you previously edited `publish-plan.md` before confirm, edit `testcases.md` or state exclusions in chat instead.

---

## `/qsx:execute`

Run the **approved** cases from `testcases.md` in a real browser, through the `qaspec-playwright` MCP server, and report only application defects.

**Syntax:**

```text
/qsx:execute [change-name]
```

**Prerequisites:**

- Approved delta specs from `/qsx:analyze` and valid cases from `/qsx:cases` (`qaspec validate cases` passes)
- An `execution` block in `qaspec/config.yaml`, and the `qaspec-playwright` server that `qaspec init` or `qaspec update` writes for it (see [CLI](cli.md#browser-server-for-qsxexecute))
- A subagent-capable agent tool: the judge runs in a fresh subagent, and the command stops when none can be launched

**What it does:**

1. Starts a run with `qaspec execute start`. With `execution.app.readiness: manual`, it halts once and asks you to confirm that the app serves the change's code.
2. Stores a plan before each case, drives the browser, records the observations, and lets the `qaspec` CLI decide every verdict. A failed case is retried once from a clean state.
3. Judges each case that still fails in a fresh subagent that did not drive the browser, as `agent`, `environment` or `app`. Only `app` becomes a finding, asked as a sense-check question for you to answer.
4. Halts once before any TCMS write, showing the results and the gate token from `qaspec execute results-gate`. After you confirm, it records the results in a TCMS run and matches cases by exact title.

Credentials stay in a git-ignored file that the login script reads, so the agent never receives them, and run folders stay out of git.

---

## `/qsx:archive`

Finalize a completed change: merge deltas into main specs when applicable and move the change to archive per your schema.

**Syntax:**

```text
/qsx:archive [change-name]
```

**CLI support:**

```bash
qaspec archive <change>
qaspec validate <change> --strict
```

---

## Configuration and sync

| Task | Command |
|------|---------|
| View/edit global profile | `qaspec config profile` |
| Apply profile to project | `qaspec update` |
| Per-artifact rules for agents | `qaspec instructions <artifact> --json` |

Delivery mode (`skills`, `commands`, or `both`) controls whether skills, slash commands, or both are written. See [Supported Tools](supported-tools.md).

---

## Related

- [Workflows](workflows.md) — QA pipeline and halts
- [Getting Started](getting-started.md) — First run
