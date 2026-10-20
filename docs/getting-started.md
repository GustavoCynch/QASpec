# Getting Started

This guide explains how QASpec works after you've installed and initialized it. For installation instructions, see the [main README](../README.md#quick-start).

## How It Works

QASpec helps testers and engineers agree on **what to test and why** before execution. You work in a planning home (`qaspec/`), produce QA artifacts in a change folder, and optionally publish approved cases to your TCMS via MCP (any MCP-backed provider).

**Default path (core profile)** — installed by `qaspec init`:

```text
/qsx:analyze ──► /qsx:cases ──► /qsx:publish ──► /qsx:execute ──► /qsx:archive
```

The global **`core`** profile includes exactly six workflows: `analyze`, `cases`, `publish`, `execute`, `catch`, `archive`. `/qsx:catch` runs after analyze, in parallel with the other steps. QASpec installs matching **`qaspec-*` skills** and **`/qsx:*` commands** (see [Supported Tools](supported-tools.md)).

Free-form investigation happens in normal chat or at the start of `/qsx:analyze` — no separate explore command is required.

> **Default install:** QASpec ships `/qsx:*` agent commands via `qaspec init`. Third-party upstream tooling is not installed by this CLI.

## What QASpec Creates

After `qaspec init`, a typical project includes:

```text
qaspec/                          # Planning home
├── config.yaml                  # QA context, rules, schema (optional)
├── references/                  # historical_bugs.md, tcms_case_rules.md, …
├── specs/                       # Source-of-truth capability specs (when used)
└── changes/
    └── <change-name>/
        ├── analysis.md          # From /qsx:analyze
        ├── testcases.md        # From /qsx:cases
        ├── catch/               # Catch runs from /qsx:catch (git-ignored)
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
| TCMS upload (`/qsx:publish`) | `/qsx:publish` | Publish approved test cases to your TCMS after human approval |
| Catch run (`catch/<run-id>/`) | `/qsx:catch` | Catching tests for a PR, their classification, findings and landing patch |
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

AI:  Resolves the TCMS target from config (or asks once on first publish), shows an in-chat summary, halts for confirm.
You: Confirm (or adjust testcases.md / scope in chat first).

AI:  Uploads approved cases via the TCMS MCP and marks checkboxes in testcases.md.
```

> **TCMS support:** publish is MCP-only and provider-neutral — `provider` is an open string, so any MCP-backed TCMS works. Installer-side connector selection for specific systems like TestRail and Xray is in active development. To help or request another system, see [Test management (TCMS)](../README.md#test-management-tcms) in the README.

### 5. Archive

```text
You: /qsx:archive

AI:  Finalizes the change (merge deltas, move to archive per schema).
```

## Run the Cases with an Agent

`/qsx:execute` runs the approved cases of a change in a real browser, through an agent, and reports only the application defects. It needs an approved change with valid cases (`qaspec validate cases` passes) and an agent tool that can launch a subagent for the judge.

1. **Set the app under test.** The `qaspec/config.yaml` that `qaspec init` creates has a commented `execution` example. Uncomment it, set `app.url` and `app.readiness`, and keep the credential and session files out of git.
2. **Log in, when the app needs a session.** Run `qaspec execute login`. It runs your login script with the credentials from a git-ignored dotenv file and saves the browser session, so the agent never receives the password.
3. **Browser server.** When `execution` is set, `qaspec init` and `qaspec update` write the `qaspec-playwright` server to `.mcp.json` (Claude Code) and `.cursor/mcp.json` (Cursor). Other tools use the manual setup in [CLI](cli.md#browser-server-for-qsxexecute).
4. **Run the cases.** In your AI tool, run `/qsx:execute <change>`.

The run asks you for these:

- **Readiness:** with `app.readiness: manual`, confirm once that the app serves the change's code.
- **Findings:** each app defect is a sense-check question: what the case expects, what was observed, and whether that is intended.
- **Needs-human steps:** a step that no check can express is listed for you to judge.
- **TCMS:** one confirmation before any write to your TCMS.

Run folders are stored in `qaspec/changes/<change>/runs/`. QASpec writes a `.gitignore` there that ignores everything, so captured app data and evidence stay out of git.

## Catch Tests for a PR

`/qsx:catch` writes tests for a PR's code change from the approved analysis. It runs them on the parent and on the PR head, and asks you about each likely regression. Tests that pass on the head can land as one patch.

1. **Approve the analysis with the PR head.** The analysis needs an `Intent class` section and `qaspec approve analyze --head-sha <sha>`.
2. **Configure the catch block.** Uncomment `catch` in `qaspec/config.yaml` and set `runner.adapter: jest`, `runner.command` and `baseRef`. The settings are in [CLI](cli.md#the-catch-block).
3. **Run `/qsx:catch <change>`.** The workflow needs a tool that can launch subagents for its judges. Without one, it stops before judging.
4. **Answer the questions, then land.** Each finding asks whether the behavior is intended. Landing asks once, and you review and commit the patch.

The run executes code that the agent wrote, with your permissions, in a worktree outside the project. Read [Trust and containment](cli.md#trust-and-containment) before the first run.

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
