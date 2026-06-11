import { statSync } from 'fs';
import path from 'path';

export const QASPEC_DIR_NAME = 'qaspec';

function isPlanningDir(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** Resolves the planning home directory name for a project root. */
export function resolvePlanningDirName(_projectRoot: string): string {
  return QASPEC_DIR_NAME;
}

/** Absolute path to the project's planning home directory. */
export function getPlanningDir(projectRoot: string): string {
  return path.join(projectRoot, QASPEC_DIR_NAME);
}

/** Whether the project has an existing `qaspec/` planning home. */
export function hasPlanningHome(projectRoot: string): boolean {
  return isPlanningDir(path.join(projectRoot, QASPEC_DIR_NAME));
}

/** Join paths under the resolved planning home for a project root. */
export function joinPlanningPath(projectRoot: string, ...segments: string[]): string {
  return path.join(getPlanningDir(projectRoot), ...segments);
}

/** Relative display path like `qaspec/config.yaml` for user-facing messages. */
export function formatPlanningRelativePath(_projectRoot: string, ...segments: string[]): string {
  return segments.length > 0 ? path.posix.join(QASPEC_DIR_NAME, ...segments) : QASPEC_DIR_NAME;
}

/** Infer project root from an absolute path under `qaspec/`. */
export function projectRootFromPlanningPath(absolutePath: string): string {
  const normalized = path.normalize(absolutePath);
  const marker = `${path.sep}${QASPEC_DIR_NAME}${path.sep}`;
  const idx = normalized.indexOf(marker);
  if (idx >= 0) {
    return normalized.slice(0, idx);
  }
  if (normalized.endsWith(`${path.sep}${QASPEC_DIR_NAME}`)) {
    return normalized.slice(0, -(`${path.sep}${QASPEC_DIR_NAME}`).length);
  }
  return path.resolve(path.dirname(absolutePath), '..', '..');
}
