# Getting Started

This guide explains how QASpec works after you've installed and initialized it. For installation instructions, see the [main README](../README.md#quick-start).

## How It Works

QASpec helps testers and engineers agree on **what to test and why** before execution. You work in a planning home (`qaspec/` or legacy `openspec/`), produce QA artifacts in a change folder, and optionally publish approved cases to your test management system.

**Default path (core profile)** — installed by `qaspec init`:

```text
/qas:explore ──► /qas:analyze ──► /qas:matrix ──► /qas:publish ──► /qas:archive
```

The global **`core`** profile includes exactly five workflows: `explore`, `analyze`, `matrix`, `publish`, `archive`. QASpec installs matching **`qas-*` skills** and **`/qas:*` commands** (see [Supported Tools](supported-tools.md)).

> **Legacy upstream tooling:** QASpec does **not** install `/opsx:*` or `openspec-*` agent commands. Use `/qas:*` from `qaspec init` unless you maintain separate upstream tooling.

## What QASpec Creates

After `qaspec init`, a typical project includes:

```text
qaspec/                          # Planning home (or openspec/ on legacy projects)
├── config.yaml                  # QA context, rules, schema (optional)
├── references/                  # historical_bugs.md, qase_test_case_rules.md, …
├── specs/                       # Source-of-truth capability specs (when used)
└── changes/
    └── <change-name>/
        ├── analisis.md          # From /qas:analyze
        ├── testmatrix.md        # From /qas:matrix
        └── specs/               # Delta specs (from matrix phase)
```

**Agent artifacts** (per selected AI tool), for example on Cursor:

- Skills: `.cursor/skills/qas-analyze/SKILL.md`, …
- Commands: `.cursor/commands/qas-analyze.md` with `/qas:analyze` in frontmatter

## Core Artifacts

| Artifact | Produced by | Purpose |
|----------|-------------|---------|
| `analisis.md` | `/qas:analyze` | Risk analysis, affected capabilities, blind-review synthesis |
| `testmatrix.md` | `/qas:matrix` | Test cases with approval checkboxes; may create delta specs |
| Qase (or TCMS) upload | `/qas:publish` | Publish approved matrix after human approval |
| Archived change | `/qas:archive` | Close the change and merge deltas when applicable |

`/qas:explore` investigates ideas without requiring prior artifacts. `/qas:matrix` and `/qas:publish` enforce halts for human approval (see [Workflows](workflows.md)).

## Example: First QA Change

### 1. Explore (optional)

```text
You: /qas:explore payment edge cases

AI:  Investigates code and references; no analisis.md required yet.
```

### 2. Analyze

```text
You: /qas:analyze checkout-timeout

AI:  Creates qaspec/changes/checkout-timeout/analisis.md
     Halts for your confirmation before matrix work.
```

### 3. Matrix

```text
You: /qas:matrix

AI:  Creates testmatrix.md and delta specs under the change
     Halts for approval of cases and requirements.
```

### 4. Publish

```text
You: /qas:publish

AI:  Uploads approved cases via configured MCP (e.g. Qase) when rules allow.
```

### 5. Archive

```text
You: /qas:archive

AI:  Finalizes the change (merge deltas, move to archive per schema).
```

## CLI Alongside Slash Commands

Use the terminal for status, validation, and config:

```bash
qaspec list
qaspec show <change>
qaspec validate <change> --strict
qaspec instructions analyze --json   # Rules/context for agents
qaspec config profile
qaspec update                        # Sync skills/commands to profile
```

## Next Steps

- [Workflows](workflows.md) — Patterns and halts for the QA pipeline
- [Commands](commands.md) — `/qas:*` reference
- [Concepts](concepts.md) — Planning home, changes, schemas
- [Customization](customization.md) — `config.yaml` context and rules
- [CLI](cli.md) — Full `qaspec` command reference
