import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';
import { FileSystemUtils } from '../../utils/file-system.js';

/** Canonical artifact filenames that may fall back to a legacy name in in-flight changes. */
export const LEGACY_GENERATES_ALIASES: Record<string, string> = {
  'testcases.md': 'testmatrix.md',
  'analysis.md': 'analisis.md',
};

export const LEGACY_TRACKS_FILE_NOTICE =
  'Using legacy testmatrix.md for progress — run `git mv testmatrix.md testcases.md` in the change dir to adopt the new name.';

export const LEGACY_ANALYSIS_FILE_NOTICE =
  'Using legacy analisis.md — run `git mv analisis.md analysis.md` in the change dir to adopt the new name.';

/**
 * Returns a one-line rename notice when resolved outputs use a legacy filename.
 */
export function getLegacyGeneratesNotice(
  generates: string,
  resolvedPaths: string[]
): string | undefined {
  const legacyName = LEGACY_GENERATES_ALIASES[generates];
  if (!legacyName) {
    return undefined;
  }
  const usesLegacy = resolvedPaths.some((p) => p.endsWith(`/${legacyName}`));
  if (!usesLegacy) {
    return undefined;
  }
  if (generates === 'analysis.md') {
    return LEGACY_ANALYSIS_FILE_NOTICE;
  }
  if (generates === 'testcases.md') {
    return LEGACY_TRACKS_FILE_NOTICE;
  }
  return undefined;
}

/**
 * Checks if a path contains glob pattern characters.
 */
export function isGlobPattern(pattern: string): boolean {
  return pattern.includes('*') || pattern.includes('?') || pattern.includes('[');
}

/**
 * Resolves an artifact's output path(s) to concrete files that currently exist.
 * Returns absolute file paths. Glob matches are sorted for deterministic output.
 */
export function resolveArtifactOutputs(changeDir: string, generates: string): string[] {
  if (!isGlobPattern(generates)) {
    const primary = resolveSingleArtifactFile(changeDir, generates);
    if (primary) {
      return [primary];
    }
    const legacyName = LEGACY_GENERATES_ALIASES[generates];
    if (legacyName) {
      const legacy = resolveSingleArtifactFile(changeDir, legacyName);
      if (legacy) {
        return [legacy];
      }
    }
    return [];
  }

  const normalizedPattern = FileSystemUtils.toPosixPath(generates);
  const matches = fg
    .sync(normalizedPattern, { cwd: changeDir, onlyFiles: true, absolute: true })
    .map((match) => FileSystemUtils.canonicalizeExistingPath(path.normalize(match)));

  return Array.from(new Set(matches)).sort();
}

/**
 * Checks if an artifact has at least one resolved output file.
 */
export function artifactOutputExists(changeDir: string, generates: string): boolean {
  return resolveArtifactOutputs(changeDir, generates).length > 0;
}

function resolveSingleArtifactFile(changeDir: string, filename: string): string | null {
  const fullPath = path.join(changeDir, filename);
  try {
    return fs.statSync(fullPath).isFile()
      ? FileSystemUtils.canonicalizeExistingPath(fullPath)
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a schema apply.tracks file, falling back to legacy filenames when configured.
 */
export function resolveTracksFilePath(
  changeDir: string,
  tracksFile: string
): { path: string; legacy: boolean } | null {
  const primary = resolveSingleArtifactFile(changeDir, tracksFile);
  if (primary) {
    return { path: primary, legacy: false };
  }
  const legacyName = LEGACY_GENERATES_ALIASES[tracksFile];
  if (legacyName) {
    const legacy = resolveSingleArtifactFile(changeDir, legacyName);
    if (legacy) {
      return { path: legacy, legacy: true };
    }
  }
  return null;
}

export function isLegacyTracksFile(tracksFile: string, resolvedPath: string): boolean {
  const legacyName = LEGACY_GENERATES_ALIASES[tracksFile];
  return legacyName !== undefined && resolvedPath.endsWith(`/${legacyName}`);
}
