/**
 * Static template strings for Bash completion scripts.
 * These are Bash-specific helper functions that never change.
 */

export const BASH_DYNAMIC_HELPERS = `# Dynamic completion helpers

_openspec_complete_changes() {
  local changes
  changes=$(qaspec __complete changes 2>/dev/null | cut -f1)
  COMPREPLY=($(compgen -W "$changes" -- "$cur"))
}

_openspec_complete_specs() {
  local specs
  specs=$(qaspec __complete specs 2>/dev/null | cut -f1)
  COMPREPLY=($(compgen -W "$specs" -- "$cur"))
}

_openspec_complete_items() {
  local items
  items=$(qaspec __complete changes 2>/dev/null | cut -f1; qaspec __complete specs 2>/dev/null | cut -f1)
  COMPREPLY=($(compgen -W "$items" -- "$cur"))
}

_openspec_complete_schemas() {
  local schemas
  schemas=$(qaspec __complete schemas 2>/dev/null | cut -f1)
  COMPREPLY=($(compgen -W "$schemas" -- "$cur"))
}`;
