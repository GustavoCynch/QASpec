import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readInputBytes, readJsonInput, readTextInput } from '../../src/commands/shared/file-input.js';

const MAX_TEXT_BYTES = 64 * 1024;

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** The message JSON.parse throws for this text, so the test does not hard-code the engine's wording. */
const parserMessage = (text: string): string => {
  try {
    JSON.parse(text);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the text to be invalid JSON');
};

describe('file inputs of the execute commands', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-file-input-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const writeFile = async (name: string, bytes: Buffer | string) => {
    const file = path.join(dir, name);
    await fs.writeFile(file, bytes);
    return file;
  };

  describe('readTextInput', () => {
    it('returns the text of a UTF-8 file as written, line breaks included', async () => {
      const file = await writeFile('note.txt', 'Título: ñandú\r\nsegunda línea\n');

      expect(readTextInput(file, 'note file')).toEqual({ ok: true, text: 'Título: ñandú\r\nsegunda línea\n' });
    });

    it('accepts a file of exactly 64 KB', async () => {
      const file = await writeFile('exact.txt', 'a'.repeat(MAX_TEXT_BYTES));

      expect(readTextInput(file, 'judgement file')).toEqual({ ok: true, text: 'a'.repeat(MAX_TEXT_BYTES) });
    });

    it('refuses a file larger than 64 KB and names it', async () => {
      const file = await writeFile('large.txt', 'a'.repeat(MAX_TEXT_BYTES + 1));

      expect(readTextInput(file, 'judgement file')).toEqual({
        ok: false,
        issues: [{ message: `The judgement file "${file}" is larger than 64 KB` }],
      });
    });

    it('refuses a directory, which is not a regular file', async () => {
      const folder = path.join(dir, 'folder');
      await fs.mkdir(folder);

      expect(readTextInput(folder, 'title file')).toEqual({
        ok: false,
        issues: [{ message: `The title file "${folder}" must be a regular file` }],
      });
    });

    it('refuses a missing file and gives the reason', () => {
      const missing = path.join(dir, 'missing.txt');

      expect(readTextInput(missing, 'note file')).toEqual({
        ok: false,
        issues: [{ message: `Cannot read the note file "${missing}": file not found` }],
      });
    });

    it('refuses bytes that are not valid UTF-8', async () => {
      // ISO-8859-1 "Tóken": 0xf3 starts a four-byte sequence that the following "k" does not continue.
      const file = await writeFile('latin1.txt', Buffer.from([0x54, 0xf3, 0x6b, 0x65, 0x6e]));

      expect(readTextInput(file, 'note file')).toEqual({
        ok: false,
        issues: [{ message: `The note file "${file}" is not valid UTF-8` }],
      });
    });
  });

  describe('readJsonInput', () => {
    it('hashes the exact bytes and returns the parsed JSON', async () => {
      const text = '{"schema":"qaspec.execution-plan/v1","steps":[]}\n';
      const file = await writeFile('plan.json', text);

      expect(readJsonInput(file, 'plan file')).toEqual({
        sha256: sha256(text),
        json: { ok: true, value: { schema: 'qaspec.execution-plan/v1', steps: [] } },
      });
    });

    it('drops a byte order mark before parsing and still hashes the bytes as written', async () => {
      const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"steps":[]}', 'utf-8')]);
      const file = await writeFile('bom.json', bytes);

      expect(readJsonInput(file, 'plan file')).toEqual({
        sha256: sha256(bytes),
        json: { ok: true, value: { steps: [] } },
      });
    });

    it('returns the parser message for invalid JSON instead of throwing', async () => {
      const text = '{"steps": [';
      const file = await writeFile('bad.json', text);

      expect(readJsonInput(file, 'observations file')).toEqual({
        sha256: sha256(text),
        json: { ok: false, message: parserMessage(text) },
      });
    });

    it('names a missing file in its error', () => {
      const missing = path.join(dir, 'missing.json');

      expect(() => readJsonInput(missing, 'plan file')).toThrow(`Cannot read plan file "${missing}": file not found`);
    });

    it('names a directory in its error instead of reading it', async () => {
      const folder = path.join(dir, 'folder');
      await fs.mkdir(folder);

      expect(() => readJsonInput(folder, 'plan file')).toThrow(`Cannot read plan file "${folder}": EISDIR`);
    });
  });

  describe('readInputBytes', () => {
    it('returns the raw bytes of the file, byte for byte', async () => {
      const bytes = Buffer.from([0x00, 0xff, 0x7b, 0x0d, 0x0a, 0x80]);
      const file = await writeFile('raw.bin', bytes);

      expect(readInputBytes(file, 'plan file').equals(bytes)).toBe(true);
    });

    it('names a missing file in its error', () => {
      const missing = path.join(dir, 'missing.bin');

      expect(() => readInputBytes(missing, 'observations file')).toThrow(
        `Cannot read observations file "${missing}": file not found`
      );
    });
  });
});
