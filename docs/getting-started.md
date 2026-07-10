# Getting Started

This guide explains how QASpec works after you've installed and initialized it. For installation instructions, see the [main README](../README.md#quick-start).

## How It Works

QASpec helps testers and engineers agree on **what to test and why** before execution. You work in a planning home (`qaspec/`), produce QA artifacts in a change folder, and optionally publish approved cases to Qase (the only supported TCMS in v1).

**Default path (core profile)** — installed by `qaspec init`:

```text
/qsx:analyze ──► /qsx:cases ──► /qsx:publish ──► /qsx:archive
```

The global **`core`** profile includes exactly four workflows: `analyze`, `cases`, `publish`, `archive`. QASpec installs matching **`qaspec-*` skills** and **`/qsx:*` commands** (see [Supported Tools](supported-tools.md)).

Free-form investigation happens in normal chat or at the start of `/qsx:analyze` — no separate explore command is required.

> **Default install:** QASpec ships `/qsx:*` agent commands via `qaspec init`. Third-party upstream tooling is not installed by this CLI.

## What QASpec Creates

After `qaspec init`, a typical project includes:

```text
qaspec/                          # Planning home
├── config.yaml                  # QA context, rules, schema (optional)
├── references/                  # historical_bugs.md, qase_test_case_rules.md, …
├── specs/                       # Source-of-truth capability specs (when used)
└── changes/
    └── <change-name>/
        ├── analysis.md          # From /qsx:analyze
        ├── testcases.md        # From /qsx:cases
        └── specs/               # Delta specs (from analyze phase)
```

**Agent artifacts** (per selected AI tool), for example on Cursor:

- Skills: `.cursor/skills/qaspec-analyze/SKILL.md`, …
- Commands: `.cursor/commands/qsx-analyze.md` with `/qsx:analyze` in frontmatter

## Core Artifacts

| Artifact | Produced by | Purpose |
|----------|-------------|---------|
| `analysis.md` + delta specs | `/qsx:analyze` | Risk analysis, affected capabilities, blind-review synthesis, and delta specs for agreed behavior |
| `testcases.md` | `/qsx:cases` | Test cases with approval checkboxes covering the approved specs |
| Qase upload (`/qsx:publish`) | `/qsx:publish` | Publish approved test cases to Qase after human approval (only TCMS supported today) |
| Archived change | `/qsx:archive` | Close the change and merge deltas when applicable |

`/qsx:analyze` includes investigation before writing `analysis.md`. `/qsx:analyze`, `/qsx:cases`, and `/qsx:publish` enforce halts for human approval (see [Workflows](workflows.md)).

## Example: First QA Change

### 1. Analyze

```text
You: /qsx:analyze checkout-timeout

AI:  Creates qaspec/changes/checkout-timeout/analysis.md
     and delta specs under specs/.
     Halts for your confirmation of both before cases work.
```

### 2. Cases

```text
You: /qsx:cases

AI:  Creates testcases.md covering the approved delta specs
     Halts for approval of the case list.
```

### 3. Publish

```text
You: /qsx:publish

AI:  Resolves Qase target from config (or asks once on first publish), shows an in-chat summary, halts for confirm.
You: Confirm (or adjust testcases.md / scope in chat first).

AI:  Uploads approved cases via Qase MCP and marks checkboxes in testcases.md.
```

> **TCMS support:** v1 publish is **Qase-only**. TestRail, Xray, and install-time TCMS selection are in active development. To help or request another system, see [Test management (TCMS)](../README.md#test-management-tcms) in the README.

### 5. Archive

```text
You: /qsx:archive

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
- [Commands](commands.md) — `/qsx:*` reference
- [Concepts](concepts.md) — Planning home, changes, schemas
- [Customization](customization.md) — `config.yaml` context and rules
- [CLI](cli.md) — Full `qaspec` command reference
