/**
 * File inputs of the execute commands (S11): a plan, observations, a judgement, a note or a title reaches the CLI
 * from a file, never from a command line, so text from the app or from the person is not expanded by a shell.
 */

import * as fs from 'node:fs';
import { TextDecoder } from 'node:util';
import path from 'path';
import { hashPlanBytes, parseJsonText, type ExecutionIssue } from '../../core/execution-plan.js';

/** Reads a JSON input file. The hash covers the exact bytes; the parse drops a byte order mark. */
export function readJsonInput(
  filePath: string,
  label: string
): { sha256: string; json: ReturnType<typeof parseJsonText> } {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(path.resolve(filePath));
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (error as Error).message;
    throw new Error(`Cannot read ${label} "${filePath}": ${reason}`);
  }
  return { sha256: hashPlanBytes(bytes), json: parseJsonText(bytes.toString('utf-8')) };
}

/** Reads an input file as raw bytes: a stored plan or observation keeps exactly what the file held. */
export function readInputBytes(filePath: string, label: string): Buffer {
  try {
    return fs.readFileSync(path.resolve(filePath));
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (error as Error).message;
    throw new Error(`Cannot read ${label} "${filePath}": ${reason}`);
  }
}

/** The largest plain text file a command reads: a judgement, a note or a title, written by the workflow. */
const MAX_TEXT_INPUT_BYTES = 64 * 1024;

/**
 * Reads a plain text input file as UTF-8, so free text reaches the CLI from a file and never from a shell command
 * line. The file must be a regular file of at most 64 KB and valid UTF-8; the text is returned as written.
 */
export function readTextInput(
  filePath: string,
  label: string
): { ok: true; text: string } | { ok: false; issues: ExecutionIssue[] } {
  const refuse = (message: string) => ({ ok: false as const, issues: [{ message }] });
  const resolved = path.resolve(filePath);
  let bytes: Buffer;
  try {
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) {
      return refuse(`The ${label} "${filePath}" must be a regular file`);
    }
    if (stats.size > MAX_TEXT_INPUT_BYTES) {
      return refuse(`The ${label} "${filePath}" is larger than 64 KB`);
    }
    bytes = fs.readFileSync(resolved);
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (error as Error).message;
    return refuse(`Cannot read the ${label} "${filePath}": ${reason}`);
  }
  if (bytes.length > MAX_TEXT_INPUT_BYTES) {
    return refuse(`The ${label} "${filePath}" is larger than 64 KB`);
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return refuse(`The ${label} "${filePath}" is not valid UTF-8`);
  }
}
