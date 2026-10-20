# CLI Reference

The QASpec CLI (`qaspec`) provides terminal commands for project setup, validation, status inspection, and management. These commands complement the AI slash commands (`/qsx:analyze`, `/qsx:cases`, etc.) documented in [Commands](commands.md).

## Summary

| Category | Commands | Purpose |
|----------|----------|---------|
| **Setup** | `init`, `update` | Initialize and update QASpec in your project |
| **Workspaces (beta)** | `workspace setup`, `workspace list`, `workspace ls`, `workspace link`, `workspace relink`, `workspace doctor`, `workspace update`, `workspace open` | Set up planning across linked repos or folders |
| **Browsing** | `list`, `view`, `show` | Explore changes and specs |
| **Validation** | `validate` | Check changes and specs for issues |
| **Lifecycle** | `archive` | Finalize completed changes |
| **Workflow** | `status`, `instructions`, `templates`, `schemas` | Artifact-driven workflow support |
| **Catch** | `catch intent`, `start`, `status`, `finish`, `context`, `risk`, `mutant`, `equivalence`, `test`, `child`, `assess`, `judge`, `report`, `answer`, `land`, `landed` | Catching tests for a PR from the approved analysis (`/qsx:catch`) |
| **Schemas** | `schema init`, `schema fork`, `schema validate`, `schema which` | Create and manage custom workflows |
| **Config** | `config` | View and modify settings |
| **Utility** | `feedback`, `completion` | Feedback and shell integration |

---

## Human vs Agent Commands

Most CLI commands are designed for **human use** in a terminal. Some commands also support **agent/script use** via JSON output.

### Human-Only Commands

These commands are interactive and designed for terminal use:

| Command | Purpose |
|---------|---------|
| `qaspec init` | Initialize project (interactive prompts) |
| `qaspec view` | Interactive dashboard |
| `qaspec config edit` | Open config in editor |
| `qaspec feedback` | Submit feedback via GitHub |
| `qaspec completion install` | Install shell completions |

### Agent-Compatible Commands

These commands support `--json` output for programmatic use by AI agents and scripts:

| Command | Human Use | Agent Use |
|---------|-----------|-----------|
| `qaspec list` | Browse changes/specs | `--json` for structured data |
| `qaspec show <item>` | Read content | `--json` for parsing |
| `qaspec validate` | Check for issues | `--all --json` for bulk validation |
| `qaspec status` | See artifact progress | `--json` for structured status |
| `qaspec instructions` | Get next steps | `--json` for agent instructions |
| `qaspec templates` | Find template paths | `--json` for path resolution |
| `qaspec schemas` | List available schemas | `--json` for schema discovery |
| `qaspec execute login` | Save the browser session for `/qsx:execute` | `--json` for the session path and redacted script output |
| `qaspec execute validate-plan` | Check an execution plan against its case in `testcases.md` | `--json` for the errors and the plan hash |
| `qaspec execute check` | Evaluate captured observations and print the case verdict | `--json` for per-check results and the verdict |
| `qaspec execute start` | Start a run for a change, when its gates pass | `--json` for the run id, state, data tag and readiness, or the blockers |
| `qaspec execute confirm` | Confirm that the app serves the change's code (`manual` readiness) | `--json` for the run state and the confirmation time |
| `qaspec execute plan` | Store the plan for one case before it runs | `--json` for the stored plan path and its SHA-256 |
| `qaspec execute record` | Record one attempt's observations and verdict | `--json` for the attempt's verdict and outcome |
| `qaspec execute finish` | Close a run as `completed` or `environment-noise` | `--json` for the final state and its reasons |
| `qaspec execute status` | Show one run, or the runs of a change | `--json` for one run's attempts, evidence and TCMS mapping, or for the change's runs |
| `qaspec execute triage-context` | Show the judge input for a case that needs triage | `--json` for the full judge input |
| `qaspec execute triage` | Record the judge's classification of a case | `--json` for the classification and any finding it created |
| `qaspec execute answer` | Record the answer to a finding | `--json` for the recorded answer and its time |
| `qaspec execute results` | Build the TCMS results of a finished run | `--json` for the results payload |
| `qaspec execute results-gate` | Check a finished run before any TCMS write | `--json` for the gate result and, when it passes, the token |
| `qaspec execute tcms-map` | Record the TCMS id of a case title | `--json` for the stored mapping |
| `qaspec catch` (every subcommand) | Run one step of `/qsx:catch` | `--json` for the step's result or its blockers; see [Catch Commands](#catch-commands) |
| `qaspec workspace setup --no-interactive` | Create a workspace with explicit inputs | `--json` for structured setup output |
| `qaspec workspace list` | Browse known workspaces | `--json` for typed workspace objects |
| `qaspec workspace link` | Link a repo or folder | `--json` for structured link output |
| `qaspec workspace relink` | Repair a linked path | `--json` for structured link output |
| `qaspec workspace doctor` | Check one workspace | `--json` for structured status output |
| `qaspec workspace update` | Refresh workspace-local agent skills | `--tools` selects agents; profile selects workflows |

---

## Global Options

These options work with all commands:

| Option | Description |
|--------|-------------|
| `--version`, `-V` | Show version number |
| `--no-color` | Disable color output |
| `--help`, `-h` | Display help for command |

---

## Setup Commands

### `qaspec init`

Initialize QASpec in your project. Creates the folder structure and configures AI tool integrations.

Default behavior uses global config defaults: profile `core`, delivery `both`, workflows `analyze`, `cases`, `publish`, `execute`, `archive`.

```
qaspec init [path] [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `path` | No | Target directory (default: current directory) |

**Options:**

| Option | Description |
|--------|-------------|
| `--tools <list>` | Configure AI tools non-interactively. Use `all`, `none`, or comma-separated list |
| `--force` | Auto-cleanup legacy files without prompting |
| `--profile <profile>` | Override global profile for this init run (`core` or `custom`) |

`--profile custom` uses whatever workflows are currently selected in global config (`qaspec config profile`).

**Supported tool IDs (`--tools`):** `amazon-q`, `antigravity`, `auggie`, `bob`, `claude`, `cline`, `codex`, `forgecode`, `codebuddy`, `continue`, `costrict`, `crush`, `cursor`, `factory`, `gemini`, `github-copilot`, `iflow`, `junie`, `kilocode`, `kimi`, `kiro`, `opencode`, `pi`, `qoder`, `lingma`, `qwen`, `roocode`, `trae`, `windsurf`

**Examples:**

```bash
# Interactive initialization
qaspec init

# Initialize in a specific directory
qaspec init ./my-project

# Non-interactive: configure for Claude and Cursor
qaspec init --tools claude,cursor

# Configure for all supported tools
qaspec init --tools all

# Override profile for this run
qaspec init --profile core

# Skip prompts and auto-cleanup legacy files
qaspec init --force
```

**What it creates:**

```
qaspec/
├── specs/              # Your specifications (source of truth)
├── changes/            # Proposed changes
└── config.yaml         # Project configuration

.claude/skills/         # Claude Code skills (if claude selected)
.cursor/skills/         # Cursor skills (if cursor selected)
.cursor/commands/       # Cursor OPSX commands (if delivery includes commands)
... (other tool configs)
```

---

### `qaspec update`

Update QASpec instruction files after upgrading the CLI. Re-generates AI tool configuration files using your current global profile, selected workflows, and delivery mode.

```
qaspec update [path] [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `path` | No | Target directory (default: current directory) |

**Options:**

| Option | Description |
|--------|-------------|
| `--force` | Force update even when files are up to date |

**Example:**

```bash
# Update instruction files after npm upgrade
npm update @qaspec/cli && qaspec update
```

---

## Workspace Commands

Workspace commands are under active development and are not ready for use yet. Do not build external automation, integrations, or long-lived workflows on top of this command surface; command behavior, state files, and JSON output can change at any point.

Coordination workspaces are planning homes for work that spans multiple repos or folders. Workspace visibility is not change commitment: link the repos or folders QASpec should know about, then create changes when you are ready to plan specific work.

### `qaspec workspace setup`

Create a workspace in the standard QASpec workspace location and link at least one existing repo or folder.

```bash
qaspec workspace setup [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--name <name>` | Workspace name. Names must be kebab-case |
| `--link <path>` | Link an existing repo or folder and infer the link name from the folder name |
| `--link <name>=<path>` | Link an existing repo or folder with an explicit link name |
| `--opener <id>` | Store a preferred opener during non-interactive setup: `codex`, `claude`, `github-copilot`, or `editor` |
| `--tools <tools>` | Install workspace-local QASpec skills for agents. Use `all`, `none`, or comma-separated tool IDs |
| `--no-interactive` | Disable prompts; requires `--name` and at least one `--link` |
| `--json` | Output JSON; requires `--no-interactive` |

**Examples:**

```bash
qaspec workspace setup
qaspec workspace setup --no-interactive --name platform --link /repos/api --link web=/repos/web
qaspec workspace setup --no-interactive --name platform --link /repos/api --opener codex
qaspec workspace setup --no-interactive --name platform --link /repos/api --tools codex,claude
qaspec workspace setup --no-interactive --json --name checkout --link /repos/platform/apps/checkout
```

Interactive setup asks for a preferred opener and can install workspace-local QASpec skills for selected agents. Non-interactive setup stores a preferred opener only when `--opener` is provided; otherwise `workspace open` prompts later in interactive terminals when a supported opener is available, or asks scripts to pass `--agent <tool>` or `--editor`.

Workspace skill installation is skills-only in this beta slice: even if global delivery is `commands` or `both`, workspace setup writes agent skill folders in the workspace root and does not create slash command files. The active global profile chooses which workflow skills are installed; `--tools` chooses which agents receive them. If `--tools` is omitted in non-interactive setup, no skills are installed and `workspace update --tools <ids>` can add them later.

### `qaspec workspace list`

List known QASpec workspaces from the local registry.

```bash
qaspec workspace list [--json]
qaspec workspace ls [--json]
```

The list shows each workspace location and linked repos or folders. Stale registry records are reported but not changed.

### `qaspec workspace link`

Record an existing repo or folder for one workspace.

```bash
qaspec workspace link [name] <path> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--workspace <name>` | Select a known workspace from the local registry |
| `--json` | Output JSON |
| `--no-interactive` | Disable workspace picker prompts |

**Examples:**

```bash
qaspec workspace link /repos/api
qaspec workspace link api-service /repos/api
qaspec workspace link --workspace platform /repos/platform/apps/checkout
```

The path must already exist. Relative paths are resolved against the command's current directory before QASpec stores the verified absolute path in machine-local workspace state. Linked paths can be full repos, packages, services, apps, or folders without a repo-local QASpec planning home.

### `qaspec workspace relink`

Repair or change the local path for an existing link.

```bash
qaspec workspace relink <name> <path> [options]
```

The path must already exist. Relink updates only the machine-local path for the stable link name.

### `qaspec workspace doctor`

Check what one workspace can resolve on the current machine.

```bash
qaspec workspace doctor [options]
```

Doctor shows the workspace location, planning path, linked repos or folders, missing paths, repo-local specs paths when present, and suggested fixes. It reports issues only; it does not repair them automatically.

Commands that need one workspace use the current workspace when run from inside a workspace folder or subdirectory. From elsewhere, pass `--workspace <name>`, select from the picker in an interactive terminal, or rely on the only known workspace when exactly one exists. In `--json` or `--no-interactive` mode, ambiguous selection fails with a structured status error and suggests `--workspace <name>`.

JSON responses use typed objects plus `status` arrays. Primary data lives in `workspace`, `workspaces`, or `link`; warnings and errors live in `status`.

### `qaspec workspace update`

Refresh workspace-local QASpec skills from the active global profile.

```bash
qaspec workspace update [name] [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--workspace <name>` | Select a known workspace from the local registry |
| `--tools <tools>` | Select agents for workspace skills. Use `all`, `none`, or comma-separated tool IDs |
| `--json` | Output JSON |
| `--no-interactive` | Disable workspace picker prompts |

**Examples:**

```bash
qaspec workspace update
qaspec workspace update platform
qaspec workspace update --workspace platform --tools codex,claude
qaspec workspace update --workspace platform --tools none
```

`workspace update` reuses the stored workspace skill agent selection when `--tools` is omitted. Passing `--tools` replaces that stored selection. It refreshes only QASpec-managed workflow skill directories in the workspace root, removes deselected managed workflow skills, and leaves linked repos and folders untouched.

Running `qaspec update` from inside a workspace planning home redirects to `qaspec workspace update`; run `qaspec update` inside repo-local projects when you want repo-owned tool files updated.

### `qaspec workspace open`

Open a workspace working set through the stored preferred opener, a one-session agent override, or VS Code editor mode.

```bash
qaspec workspace open [name] [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--workspace <name>` | Alias for the positional workspace name |
| `--agent <tool>` | One-session agent override: `codex`, `claude`, or `github-copilot` |
| `--editor` | Open the maintained VS Code workspace file as a normal editor workspace |
| `--no-interactive` | Disable workspace and opener picker prompts |

**Examples:**

```bash
qaspec workspace open
qaspec workspace open platform
qaspec workspace open platform --agent github-copilot
qaspec workspace open --agent codex
qaspec workspace open --editor
```

`workspace open` uses the current workspace when run inside one, auto-selects the only known workspace when run elsewhere, and asks the user to choose when multiple workspaces are known. `--agent` and `--editor` do not change the stored preferred opener. Passing both opener overrides is an error; choose either `--agent <tool>` or `--editor`.

QASpec maintains `<workspace-name>.code-workspace` at the workspace root for VS Code editor and GitHub Copilot-in-VS-Code opens. That file is machine-local and ignored by default with a specific `<workspace-name>.code-workspace` `.gitignore` entry, so user-authored `*.code-workspace` files remain eligible for tracking.

The maintained VS Code workspace includes the coordination root as `.` plus valid linked repos or folders as additional roots. VS Code displays those entries as a multi-root workspace.

Root workspace open supports exploration and planning across linked repos or folders. Implementation edits should start only after an explicit user request and a normal QASpec implementation workflow.

---

## Browsing Commands

### `qaspec list`

List changes or specs in your project.

```
qaspec list [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--specs` | List specs instead of changes |
| `--changes` | List changes (default) |
| `--sort <order>` | Sort by `recent` (default) or `name` |
| `--json` | Output as JSON |

**Examples:**

```bash
# List all active changes
qaspec list

# List all specs
qaspec list --specs

# JSON output for scripts
qaspec list --json
```

**Output (text):**

```
Active changes:
  add-dark-mode     UI theme switching support
  fix-login-bug     Session timeout handling
```

---

### `qaspec view`

Display an interactive dashboard for exploring specs and changes.

```
qaspec view
```

Opens a terminal-based interface for navigating your project's specifications and changes.

---

### `qaspec show`

Display details of a change or spec.

```
qaspec show [item-name] [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `item-name` | No | Name of change or spec (prompts if omitted) |

**Options:**

| Option | Description |
|--------|-------------|
| `--type <type>` | Specify type: `change` or `spec` (auto-detected if unambiguous) |
| `--json` | Output as JSON |
| `--no-interactive` | Disable prompts |

**Change-specific options:**

| Option | Description |
|--------|-------------|
| `--deltas-only` | Show only delta specs (JSON mode) |

**Spec-specific options:**

| Option | Description |
|--------|-------------|
| `--requirements` | Show only requirements, exclude scenarios (JSON mode) |
| `--no-scenarios` | Exclude scenario content (JSON mode) |
| `-r, --requirement <id>` | Show specific requirement by 1-based index (JSON mode) |

**Examples:**

```bash
# Interactive selection
qaspec show

# Show a specific change
qaspec show add-dark-mode

# Show a specific spec
qaspec show auth --type spec

# JSON output for parsing
qaspec show add-dark-mode --json
```

---

## Validation Commands

### `qaspec validate`

Validate changes and specs for structural issues.

```
qaspec validate [item-name] [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `item-name` | No | Specific item to validate (prompts if omitted) |

**Options:**

| Option | Description |
|--------|-------------|
| `--all` | Validate all changes and specs |
| `--changes` | Validate all changes |
| `--specs` | Validate all specs |
| `--type <type>` | Specify type when name is ambiguous: `change` or `spec` |
| `--strict` | Enable strict validation mode |
| `--json` | Output as JSON |
| `--concurrency <n>` | Max parallel validations (default: 6, or `QASPEC_CONCURRENCY` env) |
| `--no-interactive` | Disable prompts |

**Examples:**

```bash
# Interactive validation
qaspec validate

# Validate a specific change
qaspec validate add-dark-mode

# Validate all changes
qaspec validate --changes

# Validate everything with JSON output (for CI/scripts)
qaspec validate --all --json

# Strict validation with increased parallelism
qaspec validate --all --strict --concurrency 12
```

**Output (text):**

```
Validating add-dark-mode...
  ✓ proposal.md valid
  ✓ specs/ui/spec.md valid
  ⚠ design.md: missing "Technical Approach" section

1 warning found
```

**Output (JSON):**

```json
{
  "version": "1.0.0",
  "results": {
    "changes": [
      {
        "name": "add-dark-mode",
        "valid": true,
        "warnings": ["design.md: missing 'Technical Approach' section"]
      }
    ]
  },
  "summary": {
    "total": 1,
    "valid": 1,
    "invalid": 0
  }
}
```

---

## Lifecycle Commands

### `qaspec archive`

Archive a completed change and merge delta specs into main specs.

```
qaspec archive [change-name] [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `change-name` | No | Change to archive (prompts if omitted) |

**Options:**

| Option | Description |
|--------|-------------|
| `-y, --yes` | Skip confirmation prompts |
| `--skip-specs` | Skip spec updates (for infrastructure/tooling/doc-only changes) |
| `--no-validate` | Skip validation (requires confirmation) |

**Examples:**

```bash
# Interactive archive
qaspec archive

# Archive specific change
qaspec archive add-dark-mode

# Archive without prompts (CI/scripts)
qaspec archive add-dark-mode --yes

# Archive a tooling change that doesn't affect specs
qaspec archive update-ci-config --skip-specs
```

**What it does:**

1. Validates the change (unless `--no-validate`)
2. Prompts for confirmation (unless `--yes`)
3. Merges delta specs into `qaspec/specs/`
4. Moves change folder to `qaspec/changes/archive/YYYY-MM-DD-<name>/`

---

## Workflow Commands

These commands support QASpec's artifact-driven workflow. They're useful for both humans checking progress and agents determining next steps.

### `qaspec status`

Display artifact completion status for a change.

```
qaspec status [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--change <id>` | Change name (prompts if omitted) |
| `--schema <name>` | Schema override (auto-detected from change's config) |
| `--head-sha <sha>` | PR head SHA for approval verification (`qaspec-pr-review`) |
| `--json` | Output as JSON |

**Approval block (JSON, `qaspec-pr-review` only):**

```json
{
  "approval": {
    "analyze": "valid",
    "reason": "content-changed"
  }
}
```

States: `valid`, `stale`, or `missing`. Stale includes `reason`: `content-changed` or `head-moved`.

### `qaspec approve analyze`

Record user approval of analyze-phase artifacts after the digest halt.

```
qaspec approve analyze --change <name> [--head-sha <sha>] [--json]
```

Writes `approvals.analyze` to the change `.qaspec.yaml` with content hash over `analysis.md` + `specs/**/*.md`.

### `qaspec validate cases`

Validate `testcases.md` coverage and format against change delta specs.

```
qaspec validate cases --change <name> [--json]
```

Exits non-zero on uncovered requirements, dangling `req` references, unannotated cases, or malformed Preconditions/Steps blocks.

### `qaspec publish-gate`

Verify publish preconditions and emit a gate token.

```
qaspec publish-gate --change <name> [--head-sha <sha>] [--json]
```

Checks: approval valid, cases validation passes, usable TCMS target for the change (change `.qaspec.yaml` `tcms` block merged over config defaults). On success prints `qaspec-gate:<8-hex>` and the resolved target.

### `qaspec tcms`

Manage the per-change TCMS publish target stored in the change's `.qaspec.yaml`.

```
qaspec tcms set --change <name> [--provider <provider>] [--project <CODE>] [--base-url <url>] [--json]
qaspec tcms show --change <name> [--json]
```

`set` upserts the provided fields (at least one required) without touching others. `show` prints the resolved target with each field's source (`change` or `config`) and whether it is usable (provider + project present). The `tcms` block in `qaspec/config.yaml` acts only as user-managed defaults — no command or workflow writes it.

**Examples:**

```bash
# Interactive status check
qaspec status

# Status for specific change
qaspec status --change add-dark-mode

# JSON for agent use
qaspec status --change add-dark-mode --json
```

**Output (text):**

```
Change: add-dark-mode
Schema: spec-driven
Progress: 2/4 artifacts complete

[x] proposal
[ ] design
[x] specs
[-] tasks (blocked by: design)
```

**Output (JSON):**

```json
{
  "changeName": "add-dark-mode",
  "schemaName": "spec-driven",
  "isComplete": false,
  "applyRequires": ["tasks"],
  "artifacts": [
    {"id": "proposal", "outputPath": "proposal.md", "status": "done"},
    {"id": "design", "outputPath": "design.md", "status": "ready"},
    {"id": "specs", "outputPath": "specs/**/*.md", "status": "done"},
    {"id": "tasks", "outputPath": "tasks.md", "status": "blocked", "missingDeps": ["design"]}
  ]
}
```

### `qaspec execute login`

Run the project's login script and save the browser session that `/qsx:execute` starts from, so the agent never receives the test credentials.

```
qaspec execute login [--json]
```

Reads `execution.auth` from `qaspec/config.yaml`:

| Setting | Purpose |
|---------|---------|
| `envFile` | Dotenv file with the test credentials |
| `requiredVariables` | Variables `envFile` must define |
| `loginScript` | `.js`, `.mjs` or `.cjs` file run with Node.js |
| `storageState` | Where the browser session is saved |

Before running the script, the command stops when the project is not a git repository, when `envFile` or `storageState` is tracked by git or not ignored by it, or when both settings point at the same file. The script runs from the project root with the `envFile` variables, plus `QASPEC_STORAGE_STATE` (absolute path where it must save the session, e.g. with Playwright's `context.storageState({ path })`) and `QASPEC_APP_URL` (`execution.app.url`, when set). It must finish within 120 seconds; after that it receives SIGTERM, then SIGKILL two seconds later. On POSIX the script runs in its own process group, and any process it leaves running is stopped when the command finishes. On POSIX, if the command is interrupted (SIGINT such as Ctrl+C, SIGTERM or SIGHUP) while the script runs, it stops the script and its processes, removes the session file when it can and exits with that signal. On Windows, an interrupted command may leave a partly written session file behind. Credential values of four or more characters are replaced with `[redacted]` in the script output, both as written and as they appear inside a JSON string. The command fails when the script exits non-zero, times out or does not write a valid storage state, and removes any session file in those cases. On POSIX the session file is created readable only by its owner before the script runs (inside a new directory, that directory too), and it stays that way as long as the script writes into the existing file, as Playwright's `context.storageState({ path })` does.

### `qaspec execute validate-plan`

Check the execution plan that the agent writes for one case before it acts on that case. Nothing is executed.

```
qaspec execute validate-plan --change <name> <plan.json> [--json]
```

The plan (`schema: "qaspec.execution-plan/v1"`) names the case and, for each step of its Steps table, the checks that decide the Expected result:

```json
{
  "schema": "qaspec.execution-plan/v1",
  "change": "billing-export",
  "case": { "id": "1.1", "title": "Export totals" },
  "steps": [
    {
      "n": 2,
      "checks": [
        {
          "id": "banner",
          "source": { "kind": "dom", "target": "status banner text" },
          "op": "equals",
          "value": "Saved"
        }
      ]
    },
    { "n": 3, "checks": [], "needsHuman": "The chart colours cannot be read as a value" }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `n` | Value of the `#` column of a Steps row (a whole number from 1) |
| `checks` | Checks for the step; may be empty when `needsHuman` is set |
| `needsHuman` | Reason a person must judge the step, for an Expected result that no check can express |
| `source.kind` | `dom`, `network`, `console` or `url` |
| `source.target` | Free text: what the agent reads |
| `op` | One of the operators below |
| `negate` | Optional `true` inverts a passed or failed result |

| `op` | Fields | Passes when |
|------|--------|-------------|
| `equals` | `value` (text, number or boolean) | the observed value has the same text as `value` |
| `contains` | `value` (non-empty text) | the observed text contains `value` |
| `matches` | `pattern` (regex, at most 500 characters) | the observed text matches `pattern` |
| `compare` | `comparator` (`gt`, `gte`, `lt`, `lte`), `value` (number) | the observed number compares as stated |
| `delta` | `by` (number) | the observed `after` minus `before` equals `by` |

The checks of a plan have unique `id`s, and a plan must declare at least one check or one `needsHuman` reason, so it can never pass without verifying anything. Validation checks that the plan belongs to `--change`, that the case id exists exactly once in `testcases.md`, that every plan step has a row in that case's Steps table, that every row with an Expected cell has a check or a `needsHuman` reason, that no step or check id repeats, and that every regex compiles. Unknown keys are errors, so a misspelt option never passes silently. Errors name the case, step and check. The exit code is 1 when there are errors.

With `--json` the output is `{ change, plan, planSha256, valid, errors }`. `planSha256` is the SHA-256 of the exact file bytes.

### `qaspec execute check`

Evaluate the observations that the agent captured while it ran a case, and print the case verdict. The decision is made by the CLI, not by the agent.

```
qaspec execute check <plan.json> <observations.json> [--json]
```

Observations (`schema: "qaspec.execution-observations/v1"`) hold one entry per check that was observed:

```json
{
  "schema": "qaspec.execution-observations/v1",
  "observations": [
    { "check": "banner", "after": "Saved" },
    { "check": "total", "before": 10, "after": 12 }
  ]
}
```

Each value is text, a finite number or a boolean. An observation for a check that the plan does not declare, or a second observation for the same check, is an error. Validation errors print no verdict, because the plan or the observations cannot be evaluated.

Each check gets one status:

| Status | When |
|--------|------|
| `passed` / `failed` | The operator decided the check (`negate` already applied) |
| `missing` | No observation was recorded for the check |
| `invalid` | The operator cannot read the value: a non-numeric value for `compare` or `delta`, a `delta` without `before`, a `matches` value over 10,000 characters, or a `matches` check that runs longer than one second |

The case verdict applies these rules in order:

| Verdict | When |
|---------|------|
| `failed` | Any check failed |
| `needs-human` | A step has a `needsHuman` reason |
| `incomplete` | A check is `missing` or `invalid` |
| `passed` | Every check passed and no step needs a person |

Operator notes: `equals`, `contains` and `matches` compare the text form of the observed value, so `3` and `"3"` are equal. `compare` and `delta` accept numbers and text that is exactly a decimal number, ignoring surrounding spaces. `delta` allows a relative rounding error of 1e-9. A `matches` check that runs longer than one second, for example a pattern that backtracks catastrophically, is stopped and reported as `invalid`.

The text output lists each check and the verdict. With `--json` the output is `{ valid, errors, verdict, case, planSha256, checks, needsHuman }`; on validation errors it is `{ valid: false, errors, planSha256 }`, without a verdict. The exit code is 1 for any verdict other than `passed` and for validation errors.

### `qaspec execute start`

Start a run of `/qsx:execute` for a change. A run keeps the plans, observations and results of one execution, so a later step can prove what was stored before each case ran.

```
qaspec execute start --change <name> [--json]
```

The command creates nothing unless every gate passes:

- the analyze approval is valid and `qaspec validate cases` passes for the change (the same checks as publish; no TCMS target is needed);
- `qaspec/config.yaml` has an `execution` block with `app.url` and `app.readiness` (`manual` or `probe`); `probe` also needs `app.probeUrl`;
- when `execution.auth` is set, `envFile` and `storageState` are set, git confirms that both are ignored and not tracked, and the session file exists (otherwise run `qaspec execute login`);
- `execution.controlCase` is set and the file exists: a run cannot finish without its control case.

A failed gate prints each problem with the command or setting that resolves it and exits 1. With `--json` it prints `{ started: false, blockers: [{ code, message, resolve }] }`.

A run gets an id: a UTC timestamp plus six random hexadecimal characters, such as `20261019T163000Z-3f9a1c`. Its data tag is `<execution.dataPrefix or QASPEC>-<run-id>`, which marks test data the agent creates.

Readiness runs in this order:

1. Each `execution.readinessChecks` command runs from the project root, one after another. In text mode its command line is printed before it runs; with `--json` the command text is in `readiness.checks[].command` instead. A command that runs longer than 120 seconds gets SIGTERM, then SIGKILL two seconds later. Its output is neither printed nor stored: the run keeps the name, the command text, the exit code and the duration. On POSIX systems the processes a command started are stopped with it: when the command ends, when it times out, and when `qaspec execute start` is interrupted. A background process that a command leaves running is therefore stopped too. On Windows only the command's own shell is stopped.
2. With `probe`, one HTTP GET to `execution.app.probeUrl` must answer 2xx within 10 seconds. The run keeps only the origin and path of the URL, never its query string.
3. With `manual`, the run waits for the user. The agent must ask the user to confirm that the app serves the change's code, then run `qaspec execute confirm`.

A failed readiness command, a timeout or a failed probe still creates the run, with state `blocked-by-environment`, and marks every case `blocked-by-environment`: these cases are not failed and are not run. The command exits 1. In text mode the output names the state and each failed check or probe, and it does not report the run as started.

The control case file is copied into the run when it starts, so the run keeps the control case it began with. On success the command prints the run id, the data tag, the control case path and the run folder. With `--json` it prints `{ run, change, state, dataTag, runDir, controlCase, readiness }`.

### `qaspec execute confirm`

```
qaspec execute confirm --run <id> [--json]
```

Moves a run from `awaiting-confirmation` to `ready` once the user confirmed that the app serves the change's code. Any other state is refused.

### `qaspec execute plan`

```
qaspec execute plan --run <id> --case <case-id|control> <plan.json> [--json]
```

Validates the plan with the rules of `qaspec execute validate-plan`, against the change's `testcases.md` or, for `control`, against the control case snapshot. Then it stores a copy of the exact file bytes, with its SHA-256 and timestamp, in `plans/<case>.json` before the case runs. A stored plan is never replaced: a second plan for the same case is refused. The plan's `change` must match the run's change. For a testcase, its `case.id` must match `--case`; for `control`, its `case.id` must be a case of the control case file, and the message "is not in testcases.md" then refers to that file.

The order of the run is fixed:

- the control case runs at the start, before any other case, and it needs a verdict before another case can be planned;
- the control case runs again at the end, only after every planned case has a final verdict; no case can be planned after it.

### `qaspec execute record`

```
qaspec execute record --run <id> --case <case-id|control> <observations.json> [--json]
```

Evaluates the observations with the rules of `qaspec execute check`, against the stored copy of the plan: the plan file is not read again. Each attempt stores its observations in `observations/<case>-<attempt>.json` and its result in `results/<case>-<attempt>.json`. Observations that the stored plan does not declare are refused and use no attempt.

| Verdict of the attempt | Case status | Next step |
|------------------------|-------------|-----------|
| `passed` | `passed` | Final |
| `needs-human` | `needs-human` | Final at once, no retry; a person judges the listed steps |
| `failed` or `incomplete`, first attempt | `retry` | Run the case again from a clean state and record attempt 2 |
| `failed` or `incomplete`, second attempt | `needs-triage` | Final; a `candidate` line is added to `ledger.jsonl` |
| `failed` or `incomplete`, control case (start or end) | `needs-triage` | Final at once, no retry; a `candidate` line is added and the run finishes as `environment-noise` |

A third record for a case is refused. A control plan takes one record only, because its verdict is final. The command exits 0 only for a `passed` verdict; `needs-human`, `retry`, `needs-triage` and validation errors exit 1, and the output names the outcome.

### `qaspec execute finish`

```
qaspec execute finish --run <id> [--json]
```

Closes the run. It requires a verdict for the control case at the start and at the end, each final (`passed`, `needs-human` or `needs-triage`); a missing verdict is an error that changes nothing. When both control runs passed, the run is `completed` and the command exits 0. Otherwise the run is `environment-noise` and the command exits 1: every line of `ledger.jsonl` stays there marked `environmentNoise: true`, including any judgement, finding or answer that triage recorded before the finish, so those produce no findings.

### Run states and refusals

`plan` and `record` need a `ready` run, and `confirm` and `finish` each need their own state. Any other state is refused, and the error names it: `awaiting-confirmation` (confirm first), `blocked-by-environment` (fix the environment and start a new run), or `completed` and `environment-noise` (already finished).

`confirm`, `plan`, `record` and `finish` change a run under a lock folder, `runs/<run-id>/.lock`, which records the pid and time of the command that holds it. A command that finds the lock held waits up to 10 seconds and then fails without changing anything. A lock whose process has exited is taken over. Two commands on one run therefore never lose each other's updates. `status` reads the run without the lock.

### `qaspec execute status`

```
qaspec execute status --run <id> [--json]
qaspec execute status --change <name> [--json]
```

`--run` shows the run state, readiness results (each with its command text), control case verdicts, the status and attempts of every case, and the ledger counts. With `--json`, each attempt also lists `evidence`: the run-relative paths of the regular files that the agent saved in `evidence/<case>-<n>/` for that attempt. Symbolic links are never followed, so a link to a file or a folder, inside or outside the run, is not listed. `--change` lists the runs of a change with their state and creation time. The run id is found among the changes of the planning home. Run ids must match `<UTC timestamp>-<six hex characters>` and case ids must be a testcase id such as `1.1`, or `control`; any other value is refused before it names a file.

Run states: `awaiting-confirmation`, `ready`, `blocked-by-environment`, `completed`, `environment-noise`. Case statuses: `pending`, `planned`, `retry`, `passed`, `needs-human`, `needs-triage`, `blocked-by-environment`.

Runs stay out of git: `qaspec execute start` writes `qaspec/changes/<change>/runs/.gitignore` containing `*` when that file does not exist yet, so captured app data and evidence are never committed. An existing `runs/.gitignore` is left unchanged.

Each run is stored in `qaspec/changes/<change>/runs/<run-id>/`:

```
run.json                    run state, readiness, control case, status of every case
control/testcases.md        control case snapshot taken at start
plans/<case>.json           stored plan copies; control plans are control-start.json and control-end.json
observations/<case>-<n>.json
results/<case>-<n>.json
evidence/<case>-<n>/        evidence the agent saved for an attempt: screenshots, console and network logs, snapshots
ledger.jsonl                one line per candidate, judgement, reported finding and answer
findings.json               app findings in creation order: F1, F2, ...
findings.md                 the same findings, one sense-check question each
```

### `qaspec execute triage-context`

```
qaspec execute triage-context --run <id> --case <case-id|control> [--json]
```

Prints the judge's input for a case that needs triage (`needs-triage`). With `--json` it is the full input: the case text as written in `testcases.md` (for `control`, the control case snapshot), the stored plan with its SHA-256, each attempt's observations, results and evidence files, and the run's readiness results. Before it prints, the stored plan is checked against its recorded SHA-256. Without `--json` it prints a short summary. A case in any other status, and any run that finished as `environment-noise`, is refused: the command exits 1 and names the reason. The judge subagent and its prompt belong to the workflow template, not to this command.

### `qaspec execute triage`

```
qaspec execute triage --run <id> --case <case-id|control> --input <file.json> [--json]
qaspec execute triage --run <id> --case <case-id|control> --classification agent|environment|app --rationale "<text>" [--expected "<text>" --observed "<text>"] [--json]
```

Records the judge's classification of a case that needs triage, once per case, as a `judged` ledger line with the classification and rationale. The judgement comes from `--input <file.json>` or from the flags, never from both. `--input` reads a regular UTF-8 JSON object of at most 64 KB with the keys `classification`, `rationale`, `expected` and `observed` (the flag names without the dashes); any other key is refused. Without `--input`, `--classification` and `--rationale` are required. `app` requires `--expected` (what the case expects) and `--observed` (what the run observed); `agent` and `environment` refuse both. An `app` classification creates the next finding (`F1`, `F2`, ...) in `findings.json`, regenerates `findings.md`, and adds a `reported` ledger line. Each finding is one sense-check question: `Case 1.1 expects: <expected>. The run observed: <observed>. Is this intended?` `agent` and `environment` create no finding. A control case cannot take `app`, because a failed control case makes its run `environment-noise`, which produces no findings. A case that was already judged is refused, and so is an environment-noise run. Any refusal exits 1 and writes nothing. Triage does not change the case status: the case stays `needs-triage`, and `finish` is not affected.

Free text from the application under test, its evidence or the user never goes on a shell command line. The workflow writes the judgement as a JSON file under the run folder (`<run>/drafts/`) and passes it with `--input`, so `$(...)` or backticks in that text cannot run.

### `qaspec execute answer`

```
qaspec execute answer --run <id> --finding <finding-id> --intended yes|no [--note "<text>" | --note-file <file>] [--json]
```

Records the person's answer to one finding, once. `--intended no` (the behavior is not intended) adds a `confirmed` ledger line, and `--intended yes` (the behavior is intended) adds a `dismissed` line. Each line holds the finding id, the answer, the optional note, the time of the answer, and `secondsToAnswer`: the seconds from the finding's report to the answer. An unknown finding, a second answer to the same finding, and an answer in an environment-noise run are refused, and the command exits 1. Findings of a run that finishes as `environment-noise` are void. `--note-file <file>` reads the note from a regular UTF-8 file of at most 64 KB, as written, instead of `--note`; the two together are refused.

### `qaspec execute results`

```
qaspec execute results --run <id> [--json]
```

Builds the TCMS results of a finished run (`completed` or `environment-noise`): one entry per testcase of the change, in `testcases.md` order. Control cases are not results. Each entry has:

- `case` and `title`. The title is the TCMS match key: the checkbox text after the case number, exactly as written in `testcases.md` (`- [ ] 1.1 Export totals` gives `Export totals`). It is the same text the publish mapping sends as the case title.
- `status`: `passed` for a passed case; `failed` for a case that needs triage and was judged `app`; `blocked` for a case judged `agent` or `environment`, a case that needs triage and has no judgement yet, a case that needs a person (`needs-human`), and a case without a final verdict; `skipped` for a case that was never planned.
- `comment`: the verdict and attempt count, then the finding id and its sense-check question for an app defect, or the reason a case is blocked or skipped. Comments never contain observed values.
- `attempts` and `evidence`: the attempt count, and the run-relative paths of the evidence files saved for every attempt.

An `environment-noise` run reports every case as `blocked`, and each comment gives the reason the run finished that way. A run that is not finished is refused: the command exits 1 and writes nothing. `--json` prints the payload with `schema: "qaspec.execution-results/v1"`, the run id, the change, the run state and its finish reasons.

### `qaspec execute results-gate`

```
qaspec execute results-gate --run <id> [--json]
```

Checks that the run can be reported, like `qaspec publish-gate` does for publish. It requires that the run is finished; that, for a `completed` run, every case that needs triage has a judgement (an `environment-noise` run reports all its cases as `blocked`, so its judgements do not change the results); and that the change has a usable TCMS target (`qaspec tcms show`). It also refuses a `testcases.md` that repeats a case title, because results are matched to TCMS cases by title. When every check passes, it prints a token, `results-gate:<8 hex>`, and stores it in the run's `run.json` with the SHA-256 of the results payload. The workflow cites the token in its single confirmation halt before any TCMS write. A failed check lists every failure with the command that resolves it, exits 1, and stores no token. The token is never written to the change's `.qaspec.yaml`.

### `qaspec execute tcms-map`

```
qaspec execute tcms-map --run <id> (--title "<case title>" | --title-file <file>) --tcms-id <id> [--tcms-run <id>] [--json]
```

Records the TCMS id of one case title in `runs/<run-id>/tcms.json`, and the TCMS run id when `--tcms-run` is given. Both ids may contain only letters, digits, dot, underscore, colon and hyphen, since they are passed on the command line. `--title-file <file>` reads the title instead of `--title`: a regular UTF-8 file of at most 64 KB holding one line, the exact title with its trailing line break dropped. The two together, a file with several lines, and an empty title are refused. The workflow writes the title to a file and never puts it on a shell command line. The title must be the title of exactly one testcase of the change: an unknown title, or one that matches several testcases, is refused. A title keeps the TCMS id it was first given, and a run keeps the TCMS run it was first given; a different value is refused, and repeating the same mapping changes nothing. The write takes the run lock, so mappings recorded at the same time are all kept. `qaspec execute status --run <id> --json` shows the mapping as `tcms`. Publish records no TCMS ids, so this mapping lives only in the run folder. Creating the TCMS run and its results is the workflow's job through the TCMS MCP server; these commands prepare and record it.

### Browser server for `/qsx:execute`

When `qaspec/config.yaml` has an `execution` block, `qaspec init` and `qaspec update` write a Playwright MCP server named `qaspec-playwright` into the project-level MCP file of Claude Code (`.mcp.json`) and Cursor (`.cursor/mcp.json`). QASpec manages that server: edits made to it by hand are replaced on the next run. They change only that server: other servers and keys keep their values, although the file is rewritten as two-space-indented JSON. When the server has to be written, a file that is not valid JSON with an `mcpServers` object is skipped with a warning, and a file that cannot be written is reported without stopping the command. QASpec never writes through a symbolic link: an MCP file that is a symlink, or a `.cursor` folder that resolves outside the project, is reported instead. Paths in the `execution` block cannot contain `$`, because the agent tools expand `${...}` in these arguments. The server is removed again when `qaspec/config.yaml` no longer has a valid `execution` block; nothing changes when the config file is missing or cannot be read. `qaspec update` does this even when skills are up to date, so run it after editing the `execution` block.

The server runs `npx -y @playwright/mcp@0.0.83 --isolated`, plus:

| Setting | Argument |
|---------|----------|
| `execution.auth.storageState` | `--storage-state <project root>/<storageState>`; the project root is `${CLAUDE_PROJECT_DIR:-.}` for Claude Code and `${workspaceFolder}` for Cursor |
| `execution.network.blockedOrigins` | `--blocked-origins <origin>;<origin>` |

Claude Code asks you to approve project servers from `.mcp.json` the first time it starts them.

For other agent tools, add the same server by hand to their MCP configuration, with the session path written relative to the project root or as an absolute path:

```json
{
  "mcpServers": {
    "qaspec-playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@0.0.83", "--isolated", "--storage-state", ".qaspec/auth/storage-state.json", "--blocked-origins", "https://production.example.com"]
    }
  }
}
```

---

### `qaspec instructions`

Get enriched instructions for creating an artifact or applying tasks. Used by AI agents to understand what to create next.

```
qaspec instructions [artifact] [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `artifact` | No | Artifact ID: `proposal`, `specs`, `design`, `tasks`, or `apply` |

**Options:**

| Option | Description |
|--------|-------------|
| `--change <id>` | Change name (required in non-interactive mode) |
| `--schema <name>` | Schema override |
| `--json` | Output as JSON |

**Special case:** Use `apply` as the artifact to get task implementation instructions.

**Examples:**

```bash
# Get instructions for next artifact
qaspec instructions --change add-dark-mode

# Get specific artifact instructions
qaspec instructions design --change add-dark-mode

# Get apply/implementation instructions
qaspec instructions apply --change add-dark-mode

# JSON for agent consumption
qaspec instructions design --change add-dark-mode --json
```

**Output includes:**

- Template content for the artifact
- Project context from config
- Content from dependency artifacts
- Per-artifact rules from config

---

### `qaspec templates`

Show resolved template paths for all artifacts in a schema.

```
qaspec templates [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--schema <name>` | Schema to inspect (default: `spec-driven`) |
| `--json` | Output as JSON |

**Examples:**

```bash
# Show template paths for default schema
qaspec templates

# Show templates for custom schema
qaspec templates --schema my-workflow

# JSON for programmatic use
qaspec templates --json
```

**Output (text):**

```
Schema: spec-driven

Templates:
  proposal  → <user-schema-dir>/spec-driven/templates/proposal.md
  specs     → <user-schema-dir>/spec-driven/templates/specs.md
  design    → <user-schema-dir>/spec-driven/templates/design.md
  tasks     → <user-schema-dir>/spec-driven/templates/tasks.md

Use `qaspec templates --json` for resolved paths on your machine.
```

---

### `qaspec schemas`

List available workflow schemas with their descriptions and artifact flows.

```
qaspec schemas [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example:**

```bash
qaspec schemas
```

**Output:**

```
Available schemas:

  spec-driven (package)
    The default spec-driven development workflow
    Flow: proposal → specs → design → tasks

  my-custom (project)
    Custom workflow for this project
    Flow: research → proposal → tasks
```

---

## Catch Commands

`qaspec catch` runs the steps of `/qsx:catch`. It writes catching tests for a PR from the change's approved analysis, runs them on the parent and on the PR head in a separate worktree, and turns each likely regression into one question. The agent writes risks, mutants, tests and judge verdicts as files. The CLI validates them, runs every gate and owns the run state, so the agent never decides a gate outcome. The workflow is in [Workflows](workflows.md#catch-tests-for-a-pr).

Rules for every subcommand:

- Each one accepts `--json`.
- Text comes from files: `--input` takes a JSON file and `--note-file` a plain text file. Diffs, tests and application text never go on a command line.
- A refusal lists every problem with its resolution, writes nothing and exits with code 1.
- Every command that changes a run takes the run's lock, a `.lock` folder in the run folder, and waits up to 10 seconds for another command to release it. `status` reads without the lock.
- A run id has the form `<UTC timestamp>-<six hex characters>`, such as `20261020T153000Z-3f9a1c`.

### Order of the commands

| Step | Command | Run state needed | Run state after |
|------|---------|------------------|-----------------|
| 1 | `catch intent` | none (no run) | none |
| 2 | `catch start` | none | `ready` |
| 3 | `catch context` | `ready` | `ready` |
| 4 | `catch risk`, `catch mutant`, `catch equivalence`, `catch test` | `ready` | `ready` |
| 5 | `catch child` | `ready` | `classified` |
| 6 | `catch assess` | `classified` | `assessed` |
| 7 | `catch judge`, `catch report`, `catch answer` | `assessed` (`answer`: a reported finding) | `assessed` |
| 8 | `catch land`, `catch landed` | `classified` or `assessed` | unchanged |
| any | `catch status` | any | unchanged |
| any | `catch finish` | any | `finished` |

### Run states

| State | Meaning |
|-------|---------|
| `setting-up` | The worktree and `catch.setup` are running. A run that an interrupted command left here is closed with `finish`. |
| `ready` | Parent phase: risks, mutants and tests can be recorded. |
| `worktree-failed` | `git worktree add` failed and was rolled back. |
| `setup-failed` | `catch.setup` failed at the parent. The worktree was removed. |
| `child-running` | The child phase is moving the worktree to the head. Parent-phase commands refuse it. |
| `child-failed` | A failure after the move to the head. Terminal; `finish` cleans it up. |
| `child-setup-failed` | The reinstall on the head failed. Nothing is classified. |
| `classified` | Every gated test has its action. The worktree stays at the head. |
| `assessed` | Reports are assessed; judges and findings can follow. |
| `finished` | The worktree is removed. The run folder stays. |

### The run folder

Each run lives in `qaspec/changes/<name>/catch/<run-id>/`. The `catch/` folder holds a `.gitignore` that contains `*`, so runs stay out of git.

```
run.json              state, mode, revisions, worktree and setup results (no output)
intent.json           the intent (not written in degraded mode)
diff.patch            the PR diff, from the parent to the head
changed-files.json    changed files, repository-relative
related-tests.json    existing tests related to the changes, cached on the parent
baselines.json        related-test outcomes on the unmutated parent, cached per test set; a timeout or runner error is retried once, then cached
setup-output.json     tails of the setup output per phase (parent, child), never printed
ledger.jsonl          one line per stage
risks/ mutants/ tests/ results/ judges/ runner-output/
assessment.json       the assessed reports
findings.json         findings in creation order (F1, F2, ...)
findings.md           the same findings as questions
land/ land.patch land.json    the landing (see catch land)
```

`ledger.jsonl` has one line per stage: `started`, `setup`, `worktree-failed`, `risk`, `mutant`, `equivalence`, `test`, `child-running`, `child-failed`, `classified`, `child-setup-failed`, `rule-filtered`, `assessed`, `judged`, `judge-filtered`, `reported`, `confirmed`, `dismissed`, `landed` and `finished`. `catch status` counts them per stage.

### `qaspec catch intent`

```
qaspec catch intent --change <name> [--json]
```

Prints the intent of a change: its intent class, and each requirement with its status (`preserved`, `added`, `modified`, `removed` or `renamed`) and its scenarios. It is read-only and checks no approval; `catch start` does. The intent comes from the change's `analysis.md` and the delta specs under `specs/`. Requirements that a delta leaves untouched come from `qaspec/specs/<capability>/spec.md`.

An invalid intent exits with code 1 and lists each problem: a missing or invalid `Intent class`, or a delta that contradicts the class. Fix the analysis or its delta specs, then approve again with `qaspec approve analyze --change <name> --head-sha <sha>`. With `--json` a valid intent prints as:

```json
{
  "schema": "qaspec.catch-intent/v1",
  "change": "invoice-discount",
  "intentClass": "behavior-change",
  "capabilities": [
    {
      "name": "invoices",
      "requirements": [
        {
          "name": "invoice-total",
          "status": "modified",
          "scenarios": [
            {
              "title": "Discount applied before tax",
              "when": ["the order has a 10% discount"],
              "then": ["the tax is computed on the discounted subtotal"]
            }
          ]
        }
      ]
    }
  ]
}
```

An invalid intent prints `{ "schema", "change", "valid": false, "errors" }` instead.

### `qaspec catch start`

```
qaspec catch start --change <name> [--base <ref>] [--without-analysis --head <sha>] [--json]
```

Starts a run. It checks every gate first and creates nothing unless all of them pass. It then creates a worktree at the parent (the merge-base of the base and the PR head) and runs `catch.setup` there.

In analysis mode, the gates are:

- the project is inside a git work tree, `catch.runner.adapter` and `catch.runner.command` are set, and a base comes from `--base` or `catch.baseRef`;
- the analyze approval is valid and records a `headSha`;
- the intent is valid (`catch intent` passes);
- the parent differs from the head.

Degraded mode (`--without-analysis --head <sha>`) skips the approval and the intent, requires `--head`, and marks the run `lowConfidence`. `--head` is refused in analysis mode.

| Blocker | Resolution |
|---------|------------|
| Not inside a git work tree | Run from a project inside its git repository |
| No `catch` block | Add `catch` with `runner.adapter` and `runner.command` |
| No `runner.adapter` or no `runner.command` | Set them, for example `adapter: jest` and `command: npx jest` |
| No base | Pass `--base <ref>` or set `catch.baseRef` |
| Approval missing or stale | `qaspec approve analyze --change <name> --head-sha <sha>` |
| Approval without `headSha` | Approve again with `--head-sha` |
| `--head` in analysis mode | Remove `--head`, or add `--without-analysis` |
| `--without-analysis` without `--head` | Pass `--head <sha>` |
| Intent invalid | Fix the analysis or its delta specs, then approve again |
| Revisions unresolved | Fetch the missing commit, or check `--base` |
| Parent equals head | Check that `--base` is the branch the PR was opened from |

The text output names the state, the mode, the base, head and parent revisions, and each setup command with its exit code or timeout and its duration. Setup output is never printed. A `setup-failed` run removes its worktree. With `--json` a started run prints `{ started, run, change, state, mode, lowConfidence, baseRef, baseSha, headSha, parentSha, projectPrefix, runDir, worktree, installedFor, setup, failure }`. A refusal prints `{ started: false, blockers: [{ code, message, resolve }] }`.

**Exit:** 0 when the run is `ready`; 1 for a refusal, `setup-failed` or `worktree-failed`.

### `qaspec catch status`

```
qaspec catch status --run <id> [--change <name>] [--json]
qaspec catch status --change <name> [--json]
```

`--run` shows one run: its state, mode, revisions, worktree, setup results, failure, ledger count per stage, funnel and precision. `--change` narrows the lookup to that change. `--change` alone lists the runs of the change, one block per run.

The funnel counts risks, mutants and tests by outcome, classified tests by action, assessed and judged reports, findings with their answers (`funnel.findings`: `count`, `confirmed`, `dismissed` and `unanswered`; each finding is counted once, by its last answer in the ledger, so `count` equals the sum of the other three, and an answer that names no finding of `findings.json` is left out), and the tests that `catch landed` recorded (`funnel.landed`). A corrupt or unreadable record, ledger line, assessment or findings file is left out of its count and counted under `unreadable`, so `status` still succeeds. Precision is the confirmed findings over confirmed plus dismissed findings, and reads `none` until a finding is answered. With `--json`, `--run` adds `ledger`, `funnel` and `precision` to the run fields; `--change` prints `{ change, runs }`.

**Exit:** 0; 1 when the run or the change is unknown.

### `qaspec catch finish`

```
qaspec catch finish --run <id> [--json]
```

Removes the run's worktree and marks the run `finished`. The run folder stays. It works in any state, including failed and interrupted runs, and a second call changes nothing. A run with no recorded worktree gets a best-effort cleanup: a warning names what remains, and the ledger records `cleanup: manual`. Steps that record work refuse a finished run, except `catch answer`, which still records an answer to a finding.

**Exit:** 0, also when the run was already finished; 1 when the run is unknown.

### `qaspec catch context`

```
qaspec catch context --run <id> [--json]
```

Prints what the agent needs to write risks, mutants and tests for a `ready` run:

- the intent: its class, and each requirement with its status and scenarios (none in degraded mode);
- the changed files, relative to the project (files outside the project are dropped), and the path of the diff;
- the existing tests related to the changed sources, listed once on the parent by the Jest adapter and cached in the run.

**Exit:** 0; 1 when the run is not `ready`.

### `qaspec catch risk`

```
qaspec catch risk --run <id> --input <file> [--json]
```

Records one risk (`R1`, `R2`, ...). In an analysis run, a risk names a `preserved`, `added` or `modified` requirement by name, and optionally one of its scenarios by title. A requirement name that two capabilities share is refused.

```json
{
  "requirement": "invoice-total",
  "scenario": "Discount applied before tax",
  "summary": "A discount applied after tax would change the invoice total."
}
```

In a degraded run, a risk names a changed file instead:

```json
{
  "file": "src/billing/invoice.ts",
  "summary": "The total is computed before the discount is applied."
}
```

Unknown keys are refused. **Exit:** 0 when recorded; 1 when refused.

### `qaspec catch mutant`

```
qaspec catch mutant --run <id> --input <file> [--json]
```

Records one mutant (`M1`, `M2`, ...) of a risk and runs its gates. The mutant replaces `original` with `replacement` once, in `file` of the parent. `original` must occur exactly once in the file, and `replacement` may be `""` to delete it. The file is restored, and its bytes are verified, after every run.

```json
{
  "risk": "R1",
  "file": "src/billing/invoice.ts",
  "original": "return subtotal - discount;",
  "replacement": "return subtotal;"
}
```

The gates run in this order:

1. **Equivalence by text.** The mutant differs from the parent only in comments or in spaces between tokens; line breaks still count. For other file types, only line endings and trailing whitespace are ignored. The result is `syntactic-equivalent`, and no test runs.
2. **Baseline.** The related tests run once on the unmutated parent, and the result is cached for that source. A timeout or a runner error is retried once, by the next mutant of that source, and the outcome of that second attempt is cached whatever it is. When the baseline is not `pass`, every mutant of that source ends `baseline-not-passing`.
3. **Related tests on the mutated parent.** A failure is `caught-by-existing`, a build error is `no-build`, and a timeout or runner error is `inconclusive`. A pass, a run that executes no test, or no related test at all is `surviving`.

| Outcome | Meaning | Next step |
|---------|---------|-----------|
| `syntactic-equivalent` | Same code apart from comments or spacing | Discarded |
| `baseline-not-passing` | The related tests do not pass without the mutant | Discarded |
| `no-build` | The mutant does not build | Discarded |
| `caught-by-existing` | An existing related test fails; `caughtBy` lists the failing files | Discarded |
| `inconclusive` | Timeout or runner error | Never reported |
| `surviving` | No existing test catches it | `catch equivalence` |
| `judged-equivalent` | The judge found the mutant equivalent | Discarded |
| `non-equivalent` | The judge found that the mutant changes behavior | Eligible for a catching test |

**Exit:** 0 when recorded, whatever its outcome; 1 when refused, in which case nothing is recorded.

### `qaspec catch equivalence`

```
qaspec catch equivalence --run <id> --mutant <id> --input <file> [--json]
```

Records the verdict of a fresh-context judge on one `surviving` mutant, once.

```json
{
  "equivalent": false,
  "rationale": "The total ignores the discount, which the scenario requires."
}
```

`equivalent: true` makes the mutant `judged-equivalent` and discards it. `false` makes it `non-equivalent`, which allows a catching test. **Exit:** 0 when recorded; 1 when refused (not surviving, already judged, or unknown mutant).

### `qaspec catch test`

```
qaspec catch test --run <id> --input <file> [--json]
```

Records one test and runs its parent gates. The test path must be a new file inside the project: it must not exist on the parent, and no earlier test of the run that passed its parent gates may use it (`path-duplicate`). A test that a gate discarded does not block its path. The content is stored in the run folder, written into the worktree before each run, and removed after it.

| `kind` | Fields | Allowed in | Purpose |
|--------|--------|------------|---------|
| `catching` | `mutant`, `path`, `content` | Both modes | Catches a non-equivalent mutant |
| `functionality` | `requirement`, `scenario` (optional), `path`, `content` | Analysis runs | Checks an added or modified requirement |
| `dodgy-diff` | `path`, `content` | Degraded runs | Hardening test for a changed file |

```json
{
  "kind": "catching",
  "mutant": "M1",
  "path": "src/billing/invoice.spec.ts",
  "content": "it('applies the discount before tax', () => { /* ... */ });"
}
```

The gates:

- **`catching`** needs a `non-equivalent` mutant. The test must pass in each of the `catch.gates.parentRuns` runs on the parent, then fail on the parent with the mutant applied. A run that executes no test does not count as a pass. Outcomes: `gated`, `parent-not-passing` (every parent run fails the same way), `flaky-parent` (the parent runs disagree), `not-caught-by-test` (the mutated parent passes, executes no test or does not build), and `inconclusive` (timeout or runner error).
- **`functionality`** and **`dodgy-diff`** record their parent outcome once, without a gate: `gated`, or `inconclusive` on a timeout or runner error.

Only `gated` tests go to `catch child`. A test path that Jest does not match runs no test there, and `catch child` discards it as vacuous. **Exit:** 0 when recorded, whatever its outcome; 1 when refused.

### `qaspec catch child`

```
qaspec catch child --run <id> [--json]
```

Runs every gated test on the PR head and classifies it. The worktree moves to the head once. Setup runs again only when `catch.setup.reinstallWhenChanged` lists a path that differs between the parent and the head; with an empty list, setup runs on every switch. Each gated test runs `catch.gates.childRuns` times on the head.

Four rules discard a test before the table applies:

- a timeout or runner error in any run is `inconclusive`;
- runs that disagree are `flaky`;
- no test executed on either side is `vacuous`;
- a test path that already exists on the head is not run there, so it is `inconclusive`.

Then the table of S5 classifies the test:

| Parent | Child | Action |
|--------|-------|--------|
| pass | pass | land |
| pass | fail | report |
| fail | pass | land |
| no build | pass | land |
| no build | fail | report |
| any | no build | signal |
| fail | fail | discard |

The worktree stays at the head for landing, and the run becomes `classified`. When the reinstall on the head fails, the run becomes `child-setup-failed`, nothing is classified, and the setup output stays in the run folder. With `--json` a classified run prints `{ status: "classified", run, change, state, installedFor, results }`, where each result has `test`, `kind`, `parent`, `child` (one outcome per child run), `action` and, when present, `reason` and `detail`.

**Exit:** 0 when classified; 1 when refused or when `child-setup-failed`.

### `qaspec catch assess`

```
qaspec catch assess --run <id> [--json]
```

Assesses the reports of a `classified` run, once. A report is a test with action `report`. Each report is checked in this order:

1. **Generic rules**, in a fixed order, discard it as `rule-filtered`: `generic-environment` (connection refused, server down), `generic-module` (a module or import error that names the test file), `generic-mock` (a mock or spy used wrongly), `generic-stub` (a not-implemented stub), `generic-call-count` (a call-count expectation) and `generic-order` (an order-only difference between two collections).
2. **Project rules** from `catch.rulesFile`, in file order. A matching `false-positive` rule discards it as `rule-filtered`, with the rule id.
3. Otherwise the report is `kept`, with intent signals: `unexpected-for-intent` (it names a preserved requirement, or the class is `refactor`), `possibly-intended` (a modified requirement), `low-confidence` (degraded run) and `true-positive:<id>` for each matching `true-positive` rule.

A kept report then goes to the judges. The output lists each report with its outcome, rule and signals. **Exit:** 0 when assessed; 1 when refused, which covers a run that is not `classified` and a `catch.rulesFile` that is missing, unreadable (a folder at its path, for example), larger than 64 KB or invalid. A refusal changes nothing.

### `qaspec catch judge`

```
qaspec catch judge --run <id> --test <id> --input <file> [--json]
```

Records the verdicts of the judges on one kept report, once. The file lists exactly `catch.judges` verdicts with distinct judge names:

```json
{
  "verdicts": [
    { "judge": "judge-1", "keep": false, "confidence": "high", "rationale": "The failure comes from a fixture that this change does not touch." },
    { "judge": "judge-2", "keep": false, "confidence": "medium", "rationale": "The assertion depends on the order of an unordered list." },
    { "judge": "judge-3", "keep": true, "confidence": "high", "rationale": "The total changes for a valid order." }
  ]
}
```

Each verdict scores: keep is +1; a discard with low confidence is +0.5; a discard with medium confidence is -0.5; a discard with high confidence is -1. The median of the scores decides. A median below zero discards the report (`judge-filtered`). The example scores -1, -0.5 and +1, so its median is -0.5 and the report is discarded. Judges can only discard: they never add a report or change its signals. **Exit:** 0 when recorded, whether kept or discarded; 1 when refused.

### `qaspec catch report`

```
qaspec catch report --run <id> --test <id> --input <file> [--json]
```

Records the finding of one kept report, once. The input holds what the parent did and what the head does, written from the failure evidence. Each text is at most 1000 characters:

```json
{
  "before": "The total subtracted the discount after tax.",
  "after": "The total subtracts the discount before tax."
}
```

The CLI composes the question and writes `findings.json` and `findings.md`:

```text
Before: <before>. Now: <after>. The scenario says: <THEN lines of the risk's scenario, or "no scenario covers it">. Is this intended?
```

**Exit:** 0 when recorded; 1 when refused. A refusal covers a run that is not `assessed`, a report that the judges did not keep, and a report that already has a finding.

### `qaspec catch answer`

```
qaspec catch answer --run <id> --finding <id> --intended yes|no [--note-file <file>] [--json]
```

Records the answer to one finding, once. `--intended yes` (the behavior is intended) dismisses the finding. `--intended no` (it is not) confirms it. The optional note comes from a UTF-8 text file of at most 64 KB, and `--note-file` is the only way to pass one. Each answer records `secondsToAnswer`, the time from the report to the answer. An answer is accepted after `catch finish` too, because the person may answer later, and it still counts in the funnel and the precision. **Exit:** 0 when recorded; 1 when refused (unknown finding, already answered, or invalid note).

### `qaspec catch land`

```
qaspec catch land --run <id> [--json]
```

Prepares the landing of a `classified` or `assessed` run. It copies every test classified `land` into `land/<path>` and writes `land.patch`, a patch that adds those files against the PR head with repository-relative paths, plus `land.json`. A test whose path already exists on the head is refused and listed; the others still land. The checkout is not touched.

To apply the patch, check that your checkout is at the PR head. Then run these from the repository root:

```
git apply --check qaspec/changes/<name>/catch/<run-id>/land.patch
git apply qaspec/changes/<name>/catch/<run-id>/land.patch
```

Then record the landing with `qaspec catch landed --run <id>`. Run `git apply` from the repository root only: from a subfolder it exits 0 and silently skips paths. QASpec never commits.

**Exit:** 0 when prepared, including when no test lands or some tests were refused; 1 when the run cannot land (not classified or assessed, or finished).

### `qaspec catch landed`

```
qaspec catch landed --run <id> [--json]
```

Records the landing once, after the patch was applied: one `landed` ledger line per prepared test. It is refused when `land` was not run, when it prepared no test, when the run is finished, or when a landing is already recorded. It never writes to the checkout. **Exit:** 0 when recorded; 1 when refused.

### The `catch` block

`qaspec/config.yaml` holds every project value. The seed that `qaspec init` writes has the block commented out: uncomment it and edit it. Paths are relative to the project root. An invalid value is reported with a warning that names its field, and the field then takes its default, or stays unset when it has none.

```yaml
catch:
  baseRef: origin/main
  setup:
    commands:
      - npm ci
    reinstallWhenChanged:
      - package-lock.json
    timeoutSeconds: 900
  runner:
    adapter: jest
    command: npx jest
    timeoutSeconds: 900
  env:
    inherit:
      - CI
    set:
      TZ: UTC
  gates:
    parentRuns: 5
    childRuns: 3
  judges: 3
  rulesFile: qaspec/references/catch-rules.yaml
```

| Key | Default | Meaning |
|-----|---------|---------|
| `baseRef` | none | The branch the PR was opened from. Required unless `--base` is given. No whitespace, and it must not start with `-`. |
| `setup.commands` | none | Install commands, run in order in the worktree. Each one must be idempotent (see below). |
| `setup.reinstallWhenChanged` | none | Project-relative paths. Setup runs again on the head only when one of them differs from the parent. With none listed, setup runs on every switch to the head. |
| `setup.timeoutSeconds` | 900 | Timeout for each setup command. |
| `runner.adapter` | none | The test runner. Only `jest`. Required. |
| `runner.command` | none | The base test command. The adapter appends Jest's arguments to it, for example `npx jest` or `npm test --`. Required. |
| `runner.timeoutSeconds` | 900 | Timeout for each test run. |
| `env.inherit` | none | Variable names to pass to child processes, on top of the built-in allowlist. |
| `env.set` | none | Explicit values for child processes. They win over inherited values. |
| `gates.parentRuns` | 5 | Passing runs a catching test needs on the parent, from 1 to 20. |
| `gates.childRuns` | 3 | Runs of each gated test on the head, from 1 to 20. Every run must give the same outcome. |
| `judges` | 3 | Fresh-context judges per kept report. An odd number from 1 to 9. |
| `rulesFile` | none | Project-relative path of the assessor rules file (see below). |

The built-in allowlist is `PATH`, `HOME`, `USERPROFILE`, `TMPDIR`, `TEMP`, `TMP`, `LANG`, `LC_ALL`, `SystemRoot`, `ComSpec` and `PATHEXT`. Each child process receives only these, the `env.inherit` names that are set in your environment, and the `env.set` values.

Keep secrets out of `env.set`, because its values are written in the config file. Name the variable in `env.inherit` instead.

**Setup commands must be idempotent.** A command can run again on a worktree that already has its output: with `reinstallWhenChanged` empty, every switch to the head runs setup again. `npm ci` is idempotent, because it replaces `node_modules`. A step such as `ln -s` is not: a second run fails or nests the link.

### The rules file

`catch.rulesFile` points to a YAML file with project rules for the assessor. The seed path is `qaspec/references/catch-rules.yaml`, and the example below is the content of that file. QASpec does not create the file. Without `rulesFile`, only the generic rules run. A configured file that is missing, unreadable, larger than 64 KB or invalid refuses `qaspec catch assess`, which then changes nothing.

```yaml
# qaspec/references/catch-rules.yaml
rules:
  - id: snapshot-whitespace
    kind: false-positive
    match:
      failure: "Snapshot .* does not match"
      file: "src/**/*.spec.ts"
    reason: "Snapshot whitespace differences are formatting, not behavior."
  - id: modified-export-scenario
    kind: true-positive
    match:
      requirementStatus: [modified]
      intentClass: [behavior-change]
    reason: "A report on a modified requirement of a behavior change needs a closer look."
```

| Field | Rule |
|-------|------|
| `id` | Lowercase letters, digits and dashes. Unique. The prefix `generic-` is reserved. |
| `kind` | `false-positive` discards a matching report. `true-positive` never discards; it adds the signal `true-positive:<id>`. |
| `match` | At least one of: `failure` (a regular expression matched against each failure message), `file` (a glob matched against the project-relative path of the failing test: `*` is one folder, `**` any folders, `?` one character), `requirementStatus` (`preserved`, `added`, `modified`, `removed` or `renamed`), `intentClass` (`refactor`, `additive` or `behavior-change`). |
| `reason` | Why the rule applies. Shown with the discard. |

Unknown keys are refused, and the file may be at most 64 KB. A `false-positive` rule with `failure` discards a report only when every failure message matches. A regular expression that cannot be evaluated (a message over 10,000 characters, or a match that runs past one second) does not match, and the assessment lists the rule as not evaluated.

### Trust and containment

Mutants and generated tests are code that the agent writes. The adopter's test runner runs them with your permissions. That is the same trust as running the PR's tests locally.

| Control | What it does |
|---------|--------------|
| Worktree outside the project | Setup, mutant and test commands run in a git worktree under the system temporary folder (`qaspec-catch/`), never in your checkout, which is not changed. |
| Environment allowlist | Child processes get only the built-in allowlist, the `env.inherit` names set in your environment, and the `env.set` values. Tokens such as `GH_TOKEN` or `NPM_TOKEN` are passed only when you list them. |
| Timeouts | Setup and test commands have `timeoutSeconds` each, and git calls have 120 seconds. Setup and test processes run in their own process group: on timeout the group gets SIGTERM, then SIGKILL two seconds later. |
| Git hooks disabled | Every git call runs with an empty hooks folder. Hooks committed in the PR, or written by setup, do not run. |

There is **no network sandbox and no filesystem sandbox**. The code can read and write what your account can, and it can reach the network. Run `/qsx:catch` only on PRs whose tests you would run locally.

### Known limits

- **Sessions that escape the group.** A child process that starts its own session or process group, for example a daemon started by a test, survives the timeout kill. `qaspec` forwards only SIGINT, SIGTERM and SIGHUP to the processes it runs. A SIGKILL of `qaspec` itself stops none of them.
- **Comment scanner.** The equivalence check strips comments with a scanner for TypeScript and JavaScript. It reads `//` inside JSX text as a comment, and it cannot tell a regular expression that follows `)` from a division. A mutant that changes such text can be discarded as `syntactic-equivalent`. The effect is a missed catch, never a false finding.
- **Jest only.** `runner.adapter` accepts `jest`. The configured command must accept Jest's arguments. A test path that Jest's `testMatch` does not match runs no test, and it is discarded as vacuous.
- **Large related-test sets take minutes.** Every mutant runs its related test files. In a smoke run on a real project, 234 related tests took 503 to 576 seconds. When runs end `inconclusive` on timeouts, raise `runner.timeoutSeconds`.
- **Degraded mode has no intent.** Without an approved analysis there is no intended behavior to compare with, so every finding is marked low confidence.

---

## Schema Commands

Commands for creating and managing custom workflow schemas.

### `qaspec schema init`

Create a new project-local schema.

```
qaspec schema init <name> [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Schema name (kebab-case) |

**Options:**

| Option | Description |
|--------|-------------|
| `--description <text>` | Schema description |
| `--artifacts <list>` | Comma-separated artifact IDs (default: `proposal,specs,design,tasks`) |
| `--default` | Set as project default schema |
| `--no-default` | Don't prompt to set as default |
| `--force` | Overwrite existing schema |
| `--json` | Output as JSON |

**Examples:**

```bash
# Interactive schema creation
qaspec schema init research-first

# Non-interactive with specific artifacts
qaspec schema init rapid \
  --description "Rapid iteration workflow" \
  --artifacts "proposal,tasks" \
  --default
```

**What it creates:**

```
qaspec/schemas/<name>/
├── schema.yaml           # Schema definition
└── templates/
    ├── proposal.md       # Template for each artifact
    ├── specs.md
    ├── design.md
    └── tasks.md
```

---

### `qaspec schema fork`

Copy an existing schema to your project for customization.

```
qaspec schema fork <source> [name] [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `source` | Yes | Schema to copy |
| `name` | No | New schema name (default: `<source>-custom`) |

**Options:**

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing destination |
| `--json` | Output as JSON |

**Example:**

```bash
# Fork the built-in spec-driven schema
qaspec schema fork spec-driven my-workflow
```

---

### `qaspec schema validate`

Validate a schema's structure and templates.

```
qaspec schema validate [name] [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | No | Schema to validate (validates all if omitted) |

**Options:**

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed validation steps |
| `--json` | Output as JSON |

**Example:**

```bash
# Validate a specific schema
qaspec schema validate my-workflow

# Validate all schemas
qaspec schema validate
```

---

### `qaspec schema which`

Show where a schema resolves from (useful for debugging precedence).

```
qaspec schema which [name] [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | No | Schema name |

**Options:**

| Option | Description |
|--------|-------------|
| `--all` | List all schemas with their sources |
| `--json` | Output as JSON |

**Example:**

```bash
# Check where a schema comes from
qaspec schema which spec-driven
```

**Output:**

```
spec-driven resolves from: package
  Source: /usr/local/lib/node_modules/@qaspec/cli/schemas/spec-driven
```

**Schema precedence:**

1. Project: `qaspec/schemas/<name>/`
2. User: user-level schema directory (see `qaspec schema which --all`)
3. Package: Built-in schemas

---

## Configuration Commands

### `qaspec config`

View and modify global QASpec configuration.

```
qaspec config <subcommand> [options]
```

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `path` | Show config file location |
| `list` | Show all current settings |
| `get <key>` | Get a specific value |
| `set <key> <value>` | Set a value |
| `unset <key>` | Remove a key |
| `reset` | Reset to defaults |
| `edit` | Open in `$EDITOR` |
| `profile [preset]` | Configure workflow profile interactively or via preset |

**Examples:**

```bash
# Show config file path
qaspec config path

# List all settings
qaspec config list

# Get a specific value
qaspec config get profile

# Set a string value explicitly
qaspec config set user.name "My Name" --string

# Remove a custom setting
qaspec config unset user.name

# Reset all configuration
qaspec config reset --all --yes

# Edit config in your editor
qaspec config edit

# Configure profile with action-based wizard
qaspec config profile

# Fast preset: switch workflows to core (keeps delivery mode)
qaspec config profile core
```

`qaspec config profile` starts with a current-state summary, then lets you choose:
- Change delivery + workflows
- Change delivery only
- Change workflows only
- Keep current settings (exit)

If you keep current settings, no changes are written and no update prompt is shown.
If there are no config changes but the current project or workspace files are out of sync with your global profile/delivery, QASpec will show a warning and suggest `qaspec update` for repo-local projects or `qaspec workspace update` for workspace-local skills.
Pressing `Ctrl+C` also cancels the flow cleanly (no stack trace) and exits with code `130`.
In the workflow checklist, `[x]` means the workflow is selected in global config. To apply those selections to project files, run `qaspec update` (or choose `Apply changes to this project now?` when prompted inside a project). From inside a workspace, use `qaspec workspace update` to refresh workspace-local skills; this remains skills-only and does not generate workspace slash commands.

**Interactive examples:**

```bash
# Delivery-only update
qaspec config profile
# choose: Change delivery only
# choose delivery: Skills only

# Workflows-only update
qaspec config profile
# choose: Change workflows only
# toggle workflows in the checklist, then confirm
```

---

## Utility Commands

### `qaspec feedback`

Submit feedback about QASpec. Creates a GitHub issue.

```
qaspec feedback <message> [options]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `message` | Yes | Feedback message |

**Options:**

| Option | Description |
|--------|-------------|
| `--body <text>` | Detailed description |

**Requirements:** GitHub CLI (`gh`) must be installed and authenticated.

**Example:**

```bash
qaspec feedback "Add support for custom artifact types" \
  --body "I'd like to define my own artifact types beyond the built-in ones."
```

---

### `qaspec completion`

Manage shell completions for the QASpec CLI.

```
qaspec completion <subcommand> [shell]
```

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `generate [shell]` | Output completion script to stdout |
| `install [shell]` | Install completion for your shell |
| `uninstall [shell]` | Remove installed completions |

**Supported shells:** `bash`, `zsh`, `fish`, `powershell`

**Examples:**

```bash
# Install completions (auto-detects shell)
qaspec completion install

# Install for specific shell
qaspec completion install zsh

# Generate script for manual installation
qaspec completion generate bash > ~/.bash_completion.d/qaspec

# Uninstall
qaspec completion uninstall
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (validation failure, missing files, etc.) |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `QASPEC_CONCURRENCY` | Default concurrency for bulk validation (default: 6) |
| `EDITOR` or `VISUAL` | Editor for `qaspec config edit` |
| `NO_COLOR` | Disable color output when set |

---

## Related Documentation

- [Commands](commands.md) - AI slash commands (`/qsx:analyze`, `/qsx:cases`, etc.)
- [Workflows](workflows.md) - Common patterns and when to use each command
- [Customization](customization.md) - Create custom schemas and templates
- [Getting Started](getting-started.md) - First-time setup guide
