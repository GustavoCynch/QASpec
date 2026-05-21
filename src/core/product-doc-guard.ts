/**
 * Paths and rules for product documentation regression guards.
 */

/** Primary product guides that must not present `/opsx:` as the default install surface. */
export const PRIMARY_PRODUCT_DOC_PATHS = [
  'docs/getting-started.md',
  'docs/commands.md',
  'docs/workflows.md',
  'docs/concepts.md',
  'docs/supported-tools.md',
  'docs/cli.md',
  'docs/customization.md',
  'docs/multi-language.md',
  'docs/installation.md',
] as const;

export const OPSX_SLASH_COMMAND_PATTERN = /\/opsx:/g;

/** `openspec <subcommand>` as a CLI invocation (not repo path literals like `openspec/changes/`). */
export const OPENSPEC_CLI_COMMAND_PATTERN = /\bopenspec\s+[a-z][a-z0-9-]*/g;
