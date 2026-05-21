# Commands

Reference for QASpec **slash commands** installed by `qaspec init` and `qaspec update`. Invoke them in your AI assistant (Cursor, Claude Code, Windsurf, etc.).

For workflow patterns, see [Workflows](workflows.md). For terminal commands, see [CLI](cli.md).

> **Not installed by QASpec:** `/opsx:*` and `openspec-*` skills are legacy/upstream surfaces. See [OPSX (legacy)](opsx.md).

## Quick Reference (core profile)

| Command | Purpose |
|---------|---------|
| `/qas:explore` | Investigate a topic before committing to analysis |
| `/qas:analyze` | Create `analisis.md` (risk, capabilities, dual review) |
| `/qas:matrix` | Create `testmatrix.md` and change delta specs |
| `/qas:publish` | Publish approved cases to TCMS (e.g. Qase via MCP) |
| `/qas:archive` | Finalize and archive the change |

Workflow ids: `explore`, `analyze`, `matrix`, `publish`, `archive`. Customize subsets with `qaspec config profile` (custom profile only selects among these five).

---

## `/qas:explore`

Think through ideas, investigate the codebase, and clarify scope **without** requiring `analisis.md` or `testmatrix.md`.

**Syntax:**

```text
/qas:explore [topic]
```

**What it does:**

- Open-ended investigation; may produce notes or diagrams
- Does not skip halts for later `/qas:analyze` or `/qas:matrix`
- Can hand off to `/qas:analyze` when you are ready to formalize

**Example:**

```text
You: /qas:explore How does session refresh interact with 2FA?

AI:  Reviews auth module and references; suggests running /qas:analyze when scope is clear.
```

---

## `/qas:analyze`

Produce **`analisis.md`** for the active change: risks, affected capabilities (kebab-case), and synthesis from dual blind analysts by default.

**Syntax:**

```text
/qas:analyze [change-name-or-description]
```

**What it does:**

- Creates or updates a folder under `qaspec/changes/<change>/` (or `openspec/changes/` on legacy homes)
- Writes `analisis.md`; reads `qaspec/references/historical_bugs.md` when present
- Does **not** write `specs/**/*.md` in this step
- Ends with a **halt** for human confirmation before matrix work in the same turn

**CLI support:**

```bash
qaspec instructions analyze --json
```

---

## `/qas:matrix`

Produce **`testmatrix.md`** with mandatory checkboxes and create or update **delta specs** under the change.

**Syntax:**

```text
/qas:matrix [change-name]
```

**Prerequisites:**

- Prior `/qas:analyze` (or manually authored `analisis.md`) unless you explicitly accept gaps
- Reads `qaspec/references/qase_test_case_rules.md` when publishing to Qase later
- Reads `openspec/specs/<capability>/spec.md` or `qaspec/specs/...` for capabilities listed in `analisis.md`

**What it does:**

- Halts once for approval of **both** the case list and requirements

---

## `/qas:publish`

Upload **approved** test cases from `testmatrix.md` to the configured test management system (Qase MCP when enabled).

**Syntax:**

```text
/qas:publish [change-name]
```

**Prerequisites:**

- Approved `testmatrix.md` and delta specs from `/qas:matrix`
- Agent directs you back to `/qas:matrix` if artifacts are missing

---

## `/qas:archive`

Finalize a completed change: merge deltas into main specs when applicable and move the change to archive per your schema.

**Syntax:**

```text
/qas:archive [change-name]
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
- [OPSX (legacy)](opsx.md) — Historical `/opsx:*` workflow (not installed by QASpec CLI)
