import { existsSync, statSync } from 'fs';
import path from 'path';

export const QASPEC_DIR_NAME = 'qaspec';

/** @deprecated Use {@link resolvePlanningDirName} or {@link getPlanningDir}. Legacy planning home directory name. */
export const OPENSPEC_DIR_NAME = 'openspec';

function isPlanningDir(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolves the planning home directory name for a project root.
 * Prefers `qaspec/` when present; falls back to `openspec/` for legacy projects.
 * Defaults to `qaspec` when neither exists (greenfield init).
 */
export function resolvePlanningDirName(projectRoot: string): string {
  const qaspecPath = path.join(projectRoot, QASPEC_DIR_NAME);
  const openspecPath = path.join(projectRoot, OPENSPEC_DIR_NAME);

  if (isPlanningDir(qaspecPath)) {
    return QASPEC_DIR_NAME;
  }
  if (isPlanningDir(openspecPath)) {
    return OPENSPEC_DIR_NAME;
  }
  return QASPEC_DIR_NAME;
}

/** Absolute path to the project's planning home directory. */
export function getPlanningDir(projectRoot: string): string {
  return path.join(projectRoot, resolvePlanningDirName(projectRoot));
}

/** Whether the project has an existing planning home (`qaspec/` or `openspec/`). */
export function hasPlanningHome(projectRoot: string): boolean {
  return (
    isPlanningDir(path.join(projectRoot, QASPEC_DIR_NAME)) ||
    isPlanningDir(path.join(projectRoot, OPENSPEC_DIR_NAME))
  );
}

/** Join paths under the resolved planning home for a project root. */
export function joinPlanningPath(projectRoot: string, ...segments: string[]): string {
  return path.join(getPlanningDir(projectRoot), ...segments);
}

/** Relative display path like `qaspec/config.yaml` for user-facing messages. */
export function formatPlanningRelativePath(projectRoot: string, ...segments: string[]): string {
  const dirName = resolvePlanningDirName(projectRoot);
  return segments.length > 0 ? path.posix.join(dirName, ...segments) : dirName;
}

/** Infer project root from an absolute path under `qaspec/` or `openspec/`. */
export function projectRootFromPlanningPath(absolutePath: string): string {
  const normalized = path.normalize(absolutePath);
  for (const dirName of [QASPEC_DIR_NAME, OPENSPEC_DIR_NAME]) {
    const marker = `${path.sep}${dirName}${path.sep}`;
    const idx = normalized.indexOf(marker);
    if (idx >= 0) {
      return normalized.slice(0, idx);
    }
    if (normalized.endsWith(`${path.sep}${dirName}`)) {
      return normalized.slice(0, -(`${path.sep}${dirName}`).length);
    }
  }
  return path.resolve(path.dirname(absolutePath), '..', '..');
}
