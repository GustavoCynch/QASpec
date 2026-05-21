# Supported Tools

QASpec works with many AI coding assistants. When you run `qaspec init`, QASpec configures selected tools using your active profile, workflow selection, and delivery mode.

## How It Works

For each selected tool, QASpec can install:

1. **Skills** (if delivery includes skills): `.../skills/qas-*/SKILL.md`
2. **Commands** (if delivery includes commands): tool-specific `qas-*` or `qas/<id>` command files with `/qas:<id>` names

By default, QASpec uses the **`core`** profile:

- `explore`, `analyze`, `matrix`, `publish`, `archive`

Use `qaspec config profile` to select a **custom** subset of those five ids, then `qaspec update` to sync the project.

QASpec does **not** install legacy `openspec-*` skills or `/opsx:*` commands. It installs `qas-*` skills and `/qas:*` commands via `qaspec init`.

## Tool Directory Reference

Patterns below use `<id>` as one of: `explore`, `analyze`, `matrix`, `publish`, `archive`.

| Tool (ID) | Skills path pattern | Command path pattern |
|-----------|---------------------|----------------------|
| Amazon Q Developer (`amazon-q`) | `.amazonq/skills/qas-*/SKILL.md` | `.amazonq/prompts/qas-<id>.md` |
| Antigravity (`antigravity`) | `.agent/skills/qas-*/SKILL.md` | `.agent/workflows/qas-<id>.md` |
| Auggie (`auggie`) | `.augment/skills/qas-*/SKILL.md` | `.augment/commands/qas-<id>.md` |
| IBM Bob Shell (`bob`) | `.bob/skills/qas-*/SKILL.md` | `.bob/commands/qas-<id>.md` |
| Claude Code (`claude`) | `.claude/skills/qas-*/SKILL.md` | `.claude/commands/qas/<id>.md` |
| Cline (`cline`) | `.cline/skills/qas-*/SKILL.md` | `.clinerules/workflows/qas-<id>.md` |
| CodeBuddy (`codebuddy`) | `.codebuddy/skills/qas-*/SKILL.md` | `.codebuddy/commands/qas/<id>.md` |
| Codex (`codex`) | `.codex/skills/qas-*/SKILL.md` | `$CODEX_HOME/prompts/qas-<id>.md`\* |
| ForgeCode (`forgecode`) | `.forge/skills/qas-*/SKILL.md` | Not generated (skills only) |
| Continue (`continue`) | `.continue/skills/qas-*/SKILL.md` | `.continue/prompts/qas-<id>.prompt` |
| CoStrict (`costrict`) | `.cospec/skills/qas-*/SKILL.md` | `.cospec/openspec/commands/qas-<id>.md` |
| Crush (`crush`) | `.crush/skills/qas-*/SKILL.md` | `.crush/commands/qas/<id>.md` |
| Cursor (`cursor`) | `.cursor/skills/qas-*/SKILL.md` | `.cursor/commands/qas-<id>.md` |
| Factory Droid (`factory`) | `.factory/skills/qas-*/SKILL.md` | `.factory/commands/qas-<id>.md` |
| Gemini CLI (`gemini`) | `.gemini/skills/qas-*/SKILL.md` | `.gemini/commands/qas/<id>.toml` |
| GitHub Copilot (`github-copilot`) | `.github/skills/qas-*/SKILL.md` | `.github/prompts/qas-<id>.prompt.md`\*\* |
| iFlow (`iflow`) | `.iflow/skills/qas-*/SKILL.md` | `.iflow/commands/qas-<id>.md` |
| Junie (`junie`) | `.junie/skills/qas-*/SKILL.md` | `.junie/commands/qas-<id>.md` |
| Kilo Code (`kilocode`) | `.kilocode/skills/qas-*/SKILL.md` | `.kilocode/workflows/qas-<id>.md` |
| Kimi CLI (`kimi`) | `.kimi/skills/qas-*/SKILL.md` | Not generated (skills only) |
| Kiro (`kiro`) | `.kiro/skills/qas-*/SKILL.md` | `.kiro/prompts/qas-<id>.prompt.md` |
| Lingma (`lingma`) | `.lingma/skills/qas-*/SKILL.md` | `.lingma/commands/qas/<id>.md` |
| OpenCode (`opencode`) | `.opencode/skills/qas-*/SKILL.md` | `.opencode/commands/qas-<id>.md` |
| Pi (`pi`) | `.pi/skills/qas-*/SKILL.md` | `.pi/prompts/qas-<id>.md` |
| Qoder (`qoder`) | `.qoder/skills/qas-*/SKILL.md` | `.qoder/commands/qas/<id>.md` |
| Qwen Code (`qwen`) | `.qwen/skills/qas-*/SKILL.md` | `.qwen/commands/qas-<id>.toml` |
| RooCode (`roocode`) | `.roo/skills/qas-*/SKILL.md` | `.roo/commands/qas-<id>.md` |
| Trae (`trae`) | `.trae/skills/qas-*/SKILL.md` | Not generated (skills only) |
| Windsurf (`windsurf`) | `.windsurf/skills/qas-*/SKILL.md` | `.windsurf/workflows/qas-<id>.md` |

\* Codex commands are installed in the global Codex home (`$CODEX_HOME/prompts/` if set, otherwise `~/.codex/prompts/`), not your project directory.

\*\* GitHub Copilot prompt files are recognized as custom slash commands in IDE extensions (VS Code, JetBrains, Visual Studio). Copilot CLI does not currently consume `.github/prompts/*.prompt.md` directly.

## Non-Interactive Setup

For CI/CD or scripted setup, use `--tools` (and optionally `--profile`):

```bash
qaspec init --tools claude,cursor
qaspec init --tools all
qaspec init --tools none
qaspec init --profile core
```

**Available tool IDs (`--tools`):** `amazon-q`, `antigravity`, `auggie`, `bob`, `claude`, `cline`, `codex`, `forgecode`, `codebuddy`, `continue`, `costrict`, `crush`, `cursor`, `factory`, `gemini`, `github-copilot`, `iflow`, `junie`, `kilocode`, `kimi`, `kiro`, `opencode`, `pi`, `qoder`, `lingma`, `qwen`, `roocode`, `trae`, `windsurf`

## Workflow-Dependent Installation

- **Core profile (default):** all five QASpec workflows
- **Custom profile:** any subset of `explore`, `analyze`, `matrix`, `publish`, `archive`

Skill and command counts depend on profile and delivery (`skills`, `commands`, or `both`).

## Generated skill directories

When selected by profile, QASpec generates:

- `qas-explore`
- `qas-analyze`
- `qas-matrix`
- `qas-publish`
- `qas-archive`

Slash command frontmatter uses `/qas:<id>` (e.g. `/qas:analyze`). See [Commands](commands.md).

## Related

- [CLI Reference](cli.md) — Terminal commands
- [Commands](commands.md) — Slash commands
- [Getting Started](getting-started.md) — First-time setup
