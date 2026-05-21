/**
 * Paths and rules for product documentation regression guards.
 */

/** Docs that may mention `/opsx:*` for legacy, upstream, or migration context. */
export const LEGACY_OPSX_DOC_PATHS = ['docs/opsx.md', 'docs/migration-guide.md'] as const;

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
