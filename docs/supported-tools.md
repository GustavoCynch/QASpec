# Supported Tools

QASpec works with many AI coding assistants. When you run `qaspec init`, QASpec configures selected tools using your active profile, workflow selection, and delivery mode.

## How It Works

For each selected tool, QASpec can install:

1. **Skills** (if delivery includes skills): `.../skills/qaspec-*/SKILL.md`
2. **Commands** (if delivery includes commands): tool-specific `qsx-*` or `qsx/<id>` command files with `/qsx:<id>` names

By default, QASpec uses the **`core`** profile:

- `analyze`, `matrix`, `publish`, `archive`

Use `qaspec config profile` to select a **custom** subset of those four ids, then `qaspec update` to sync the project.

QASpec installs `qaspec-*` skills and `/qsx:*` commands via `qaspec init` (not third-party upstream skill packs).

## Tool Directory Reference

Patterns below use `<id>` as one of: `analyze`, `matrix`, `publish`, `archive`.

| Tool (ID) | Skills path pattern | Command path pattern |
|-----------|---------------------|----------------------|
| Amazon Q Developer (`amazon-q`) | `.amazonq/skills/qaspec-*/SKILL.md` | `.amazonq/prompts/qas-<id>.md` |
| Antigravity (`antigravity`) | `.agent/skills/qaspec-*/SKILL.md` | `.agent/workflows/qas-<id>.md` |
| Auggie (`auggie`) | `.augment/skills/qaspec-*/SKILL.md` | `.augment/commands/qsx-<id>.md` |
| IBM Bob Shell (`bob`) | `.bob/skills/qaspec-*/SKILL.md` | `.bob/commands/qsx-<id>.md` |
| Claude Code (`claude`) | `.claude/skills/qaspec-*/SKILL.md` | `.claude/commands/qas/<id>.md` |
| Cline (`cline`) | `.cline/skills/qaspec-*/SKILL.md` | `.clinerules/workflows/qas-<id>.md` |
| CodeBuddy (`codebuddy`) | `.codebuddy/skills/qaspec-*/SKILL.md` | `.codebuddy/commands/qas/<id>.md` |
| Codex (`codex`) | `.codex/skills/qaspec-*/SKILL.md` | `$CODEX_HOME/prompts/qas-<id>.md`\* |
| ForgeCode (`forgecode`) | `.forge/skills/qaspec-*/SKILL.md` | Not generated (skills only) |
| Continue (`continue`) | `.continue/skills/qaspec-*/SKILL.md` | `.continue/prompts/qas-<id>.prompt` |
| CoStrict (`costrict`) | `.cospec/skills/qaspec-*/SKILL.md` | `.cospec/commands/qsx-<id>.md` |
| Crush (`crush`) | `.crush/skills/qaspec-*/SKILL.md` | `.crush/commands/qas/<id>.md` |
| Cursor (`cursor`) | `.cursor/skills/qaspec-*/SKILL.md` | `.cursor/commands/qsx-<id>.md` |
| Factory Droid (`factory`) | `.factory/skills/qaspec-*/SKILL.md` | `.factory/commands/qsx-<id>.md` |
| Gemini CLI (`gemini`) | `.gemini/skills/qaspec-*/SKILL.md` | `.gemini/commands/qas/<id>.toml` |
| GitHub Copilot (`github-copilot`) | `.github/skills/qaspec-*/SKILL.md` | `.github/prompts/qas-<id>.prompt.md`\*\* |
| iFlow (`iflow`) | `.iflow/skills/qaspec-*/SKILL.md` | `.iflow/commands/qsx-<id>.md` |
| Junie (`junie`) | `.junie/skills/qaspec-*/SKILL.md` | `.junie/commands/qsx-<id>.md` |
| Kilo Code (`kilocode`) | `.kilocode/skills/qaspec-*/SKILL.md` | `.kilocode/workflows/qas-<id>.md` |
| Kimi CLI (`kimi`) | `.kimi/skills/qaspec-*/SKILL.md` | Not generated (skills only) |
| Kiro (`kiro`) | `.kiro/skills/qaspec-*/SKILL.md` | `.kiro/prompts/qas-<id>.prompt.md` |
| Lingma (`lingma`) | `.lingma/skills/qaspec-*/SKILL.md` | `.lingma/commands/qas/<id>.md` |
| OpenCode (`opencode`) | `.opencode/skills/qaspec-*/SKILL.md` | `.opencode/commands/qsx-<id>.md` |
| Pi (`pi`) | `.pi/skills/qaspec-*/SKILL.md` | `.pi/prompts/qas-<id>.md` |
| Qoder (`qoder`) | `.qoder/skills/qaspec-*/SKILL.md` | `.qoder/commands/qas/<id>.md` |
| Qwen Code (`qwen`) | `.qwen/skills/qaspec-*/SKILL.md` | `.qwen/commands/qsx-<id>.toml` |
| RooCode (`roocode`) | `.roo/skills/qaspec-*/SKILL.md` | `.roo/commands/qsx-<id>.md` |
| Trae (`trae`) | `.trae/skills/qaspec-*/SKILL.md` | Not generated (skills only) |
| Windsurf (`windsurf`) | `.windsurf/skills/qaspec-*/SKILL.md` | `.windsurf/workflows/qas-<id>.md` |

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

- **Core profile (default):** all four QASpec workflows
- **Custom profile:** any subset of `analyze`, `matrix`, `publish`, `archive`

Skill and command counts depend on profile and delivery (`skills`, `commands`, or `both`).

## Generated skill directories

When selected by profile, QASpec generates:

- `qaspec-analyze`
- `qaspec-matrix`
- `qaspec-publish`
- `qaspec-archive`

Slash command frontmatter uses `/qsx:<id>` (e.g. `/qsx:analyze`). See [Commands](commands.md).

## Related

- [CLI Reference](cli.md) — Terminal commands
- [Commands](commands.md) — Slash commands
- [Getting Started](getting-started.md) — First-time setup
