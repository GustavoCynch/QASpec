import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import {
  scaffoldQaspecReferences,
  migrateReferenceFilenames,
  REFERENCE_FILES,
} from '../../src/core/reference-scaffold.js';

const REFERENCES_DIR = path.join('qaspec', 'references');
const LEGACY_NAME = 'qase_test_case_rules.md';

describe('reference-scaffold', () => {
  let testDir: string;
  let refsDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `qaspec-reference-scaffold-${randomUUID()}`);
    refsDir = path.join(testDir, REFERENCES_DIR);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('scaffoldQaspecReferences', () => {
    it('seeds tcms_case_rules.md (not the legacy name) when neither file exists', async () => {
      const created = await scaffoldQaspecReferences(testDir);

      expect(created).toContain(path.join(REFERENCES_DIR, REFERENCE_FILES.tcmsRules));

      const newFilePath = path.join(refsDir, REFERENCE_FILES.tcmsRules);
      expect(await fileExists(newFilePath)).toBe(true);

      const legacyFilePath = path.join(refsDir, LEGACY_NAME);
      expect(await fileExists(legacyFilePath)).toBe(false);
    });

    it('seeds content with a conceptual field-mapping table (title/description/steps/suite) and generic omit-on-unmapped wording', async () => {
      await scaffoldQaspecReferences(testDir);

      const content = await fs.readFile(path.join(refsDir, REFERENCE_FILES.tcmsRules), 'utf-8');

      expect(content).toContain('title');
      expect(content).toContain('description');
      expect(content.toLowerCase()).toContain('preconditions');
      expect(content).toContain('steps');
      expect(content.toLowerCase()).toContain('action');
      expect(content.toLowerCase()).toContain('expected');
      expect(content).toContain('suite');
      expect(content).toContain('Omit-on-unmapped');
      expect(content).not.toMatch(/Qase field/i);
    });

    it('does not overwrite an existing tcms_case_rules.md (create-if-missing)', async () => {
      await fs.mkdir(refsDir, { recursive: true });
      const customContent = 'my custom team rules';
      await fs.writeFile(path.join(refsDir, REFERENCE_FILES.tcmsRules), customContent);

      const created = await scaffoldQaspecReferences(testDir);

      const content = await fs.readFile(path.join(refsDir, REFERENCE_FILES.tcmsRules), 'utf-8');
      expect(content).toBe(customContent);
      expect(created).not.toContain(path.join(REFERENCES_DIR, REFERENCE_FILES.tcmsRules));
    });
  });

  describe('migrateReferenceFilenames', () => {
    it('renames legacy file to the new name, preserving content, when only legacy exists', async () => {
      await fs.mkdir(refsDir, { recursive: true });
      const customContent = 'custom provider field codes\nline two';
      await fs.writeFile(path.join(refsDir, LEGACY_NAME), customContent);

      const renamed = await migrateReferenceFilenames(testDir);

      expect(renamed).toContain(path.join(REFERENCES_DIR, REFERENCE_FILES.tcmsRules));
      expect(await fileExists(path.join(refsDir, LEGACY_NAME))).toBe(false);

      const newContent = await fs.readFile(path.join(refsDir, REFERENCE_FILES.tcmsRules), 'utf-8');
      expect(newContent).toBe(customContent);
    });

    it('leaves both files untouched when both legacy and new files exist', async () => {
      await fs.mkdir(refsDir, { recursive: true });
      await fs.writeFile(path.join(refsDir, LEGACY_NAME), 'legacy content');
      await fs.writeFile(path.join(refsDir, REFERENCE_FILES.tcmsRules), 'new content');

      const renamed = await migrateReferenceFilenames(testDir);

      expect(renamed).toEqual([]);
      expect(await fs.readFile(path.join(refsDir, LEGACY_NAME), 'utf-8')).toBe('legacy content');
      expect(await fs.readFile(path.join(refsDir, REFERENCE_FILES.tcmsRules), 'utf-8')).toBe('new content');
    });

    it('is a no-op when only the new file exists', async () => {
      await fs.mkdir(refsDir, { recursive: true });
      await fs.writeFile(path.join(refsDir, REFERENCE_FILES.tcmsRules), 'new content');

      const renamed = await migrateReferenceFilenames(testDir);

      expect(renamed).toEqual([]);
      expect(await fs.readFile(path.join(refsDir, REFERENCE_FILES.tcmsRules), 'utf-8')).toBe('new content');
    });

    it('is a no-op when neither file exists', async () => {
      const renamed = await migrateReferenceFilenames(testDir);

      expect(renamed).toEqual([]);
      expect(await fileExists(refsDir)).toBe(false);
    });

    it('is idempotent — running twice after a rename produces a stable no-op second run', async () => {
      await fs.mkdir(refsDir, { recursive: true });
      const customContent = 'idempotency check content';
      await fs.writeFile(path.join(refsDir, LEGACY_NAME), customContent);

      const firstRun = await migrateReferenceFilenames(testDir);
      expect(firstRun).toContain(path.join(REFERENCES_DIR, REFERENCE_FILES.tcmsRules));

      await expect(migrateReferenceFilenames(testDir)).resolves.toEqual([]);

      const finalContent = await fs.readFile(path.join(refsDir, REFERENCE_FILES.tcmsRules), 'utf-8');
      expect(finalContent).toBe(customContent);
    });
  });
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
