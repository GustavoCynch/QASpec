# Commands

Reference for QASpec **slash commands** installed by `qaspec init` and `qaspec update`. Invoke them in your AI assistant (Cursor, Claude Code, Windsurf, etc.).

For workflow patterns, see [Workflows](workflows.md). For terminal commands, see [CLI](cli.md).

> **Not installed by QASpec:** legacy upstream slash-command workflows and third-party skill packs. QASpec ships `/qsx:*` commands via `qaspec init`.

## Quick Reference (core profile)

| Command | Purpose |
|---------|---------|
| `/qsx:analyze` | Create `analysis.md` (risk, capabilities, dual review) |
| `/qsx:cases` | Create `testcases.md` and change delta specs |
| `/qsx:publish` | Publish approved cases to **Qase** (only TCMS supported today; via MCP) |
| `/qsx:archive` | Finalize and archive the change |

Workflow ids: `analyze`, `cases`, `publish`, `archive`. Customize subsets with `qaspec config profile` (custom profile only selects among these four).

Informal investigation happens in normal chat or at the start of `/qsx:analyze`.

---

## `/qsx:analyze`

Produce **`analysis.md`** for the active change: risks, affected capabilities (kebab-case), and synthesis from dual blind analysts by default.

**Syntax:**

```text
/qsx:analyze [change-name-or-description]
```

**What it does:**

- Creates or updates a folder under `qaspec/changes/<change>/`
- Writes `analysis.md`; reads `qaspec/references/historical_bugs.md` when present
- Does **not** write `specs/**/*.md` in this step
- Ends with a **halt** for human confirmation; persist answers in `analysis.md` (**Validated clarifications**) before `/qsx:cases`

**CLI support:**

```bash
qaspec instructions analyze --json
```

---

## `/qsx:cases`

Produce **`testcases.md`** with mandatory checkboxes and create or update **delta specs** under the change.

**Syntax:**

```text
/qsx:cases [change-name]
```

**Prerequisites:**

- Prior `/qsx:analyze` (or manually authored `analysis.md`) unless you explicitly accept gaps
- Reads `qaspec/references/qase_test_case_rules.md` when publishing to Qase later
- Reads `qaspec/specs/<capability>/spec.md` for capabilities listed in `analysis.md`

**What it does:**

- Treats approved `analysis.md` as source of truth (over PR diff when they conflict)
- Halts once for approval of **both** the case list and requirements

---

## `/qsx:publish`

Prepare and upload **approved** test cases from `testcases.md` to **Qase** via MCP. Other TCMS connectors (TestRail, Xray, install-time selection) are not available yet — see [Test management (TCMS)](../README.md#test-management-tcms) to collaborate on the roadmap.

**Syntax:**

```text
/qsx:publish [change-name]
```

**Prerequisites:**

- Approved `testcases.md` and delta specs from `/qsx:cases`
- Agent directs you back to `/qsx:cases` if artifacts are missing

**What it does:**

1. Resolves the TCMS target from `tcms` in `qaspec/config.yaml` (or discovers/creates a Qase project on first run and persists the choice to config).
2. Presents an in-chat publish summary (target, suites, unchecked-case counts, warnings) and halts once for confirm — **no Qase upload in that message**.
3. After you confirm, uploads via MCP, writes `publish-log.md`, and marks published rows `- [x]` in `testcases.md`.

**TCMS config** (`qaspec/config.yaml`):

```yaml
tcms:
  provider: qase
  project: YOUR_PROJECT_CODE
  baseUrl: https://app.qase.io
```

Fresh installs include a commented example. If you previously edited `publish-plan.md` before confirm, edit `testcases.md` or state exclusions in chat instead.

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
