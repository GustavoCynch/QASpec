# Commands

Reference for QASpec **slash commands** installed by `qaspec init` and `qaspec update`. Invoke them in your AI assistant (Cursor, Claude Code, Windsurf, etc.).

For workflow patterns, see [Workflows](workflows.md). For terminal commands, see [CLI](cli.md).

> **Not installed by QASpec:** legacy upstream slash-command workflows and third-party skill packs. QASpec ships `/qsx:*` commands via `qaspec init`.

## Quick Reference (core profile)

| Command | Purpose |
|---------|---------|
| `/qsx:explore` | Investigate a topic before committing to analysis |
| `/qsx:analyze` | Create `analisis.md` (risk, capabilities, dual review) |
| `/qsx:matrix` | Create `testmatrix.md` and change delta specs |
| `/qsx:publish` | Publish approved cases to TCMS (e.g. Qase via MCP) |
| `/qsx:archive` | Finalize and archive the change |

Workflow ids: `explore`, `analyze`, `matrix`, `publish`, `archive`. Customize subsets with `qaspec config profile` (custom profile only selects among these five).

---

## `/qsx:explore`

Think through ideas, investigate the codebase, and clarify scope **without** requiring `analisis.md` or `testmatrix.md`.

**Syntax:**

```text
/qsx:explore [topic]
```

**What it does:**

- Open-ended investigation; may produce notes or diagrams
- Does not skip halts for later `/qsx:analyze` or `/qsx:matrix`
- Can hand off to `/qsx:analyze` when you are ready to formalize

**Example:**

```text
You: /qsx:explore How does session refresh interact with 2FA?

AI:  Reviews auth module and references; suggests running /qsx:analyze when scope is clear.
```

---

## `/qsx:analyze`

Produce **`analisis.md`** for the active change: risks, affected capabilities (kebab-case), and synthesis from dual blind analysts by default.

**Syntax:**

```text
/qsx:analyze [change-name-or-description]
```

**What it does:**

- Creates or updates a folder under `qaspec/changes/<change>/`
- Writes `analisis.md`; reads `qaspec/references/historical_bugs.md` when present
- Does **not** write `specs/**/*.md` in this step
- Ends with a **halt** for human confirmation before matrix work in the same turn

**CLI support:**

```bash
qaspec instructions analyze --json
```

---

## `/qsx:matrix`

Produce **`testmatrix.md`** with mandatory checkboxes and create or update **delta specs** under the change.

**Syntax:**

```text
/qsx:matrix [change-name]
```

**Prerequisites:**

- Prior `/qsx:analyze` (or manually authored `analisis.md`) unless you explicitly accept gaps
- Reads `qaspec/references/qase_test_case_rules.md` when publishing to Qase later
- Reads `qaspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md`

**What it does:**

- Halts once for approval of **both** the case list and requirements

---

## `/qsx:publish`

Upload **approved** test cases from `testmatrix.md` to the configured test management system (Qase MCP when enabled).

**Syntax:**

```text
/qsx:publish [change-name]
```

**Prerequisites:**

- Approved `testmatrix.md` and delta specs from `/qsx:matrix`
- Agent directs you back to `/qsx:matrix` if artifacts are missing

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
