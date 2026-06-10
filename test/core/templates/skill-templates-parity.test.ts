import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  type SkillTemplate,
  getQasAnalyzeSkillTemplate,
  getQasMatrixSkillTemplate,
  getQasPublishSkillTemplate,
  getQasArchiveSkillTemplate,
  getQasAnalyzeCommandTemplate,
  getQasMatrixCommandTemplate,
  getQasPublishCommandTemplate,
  getQasArchiveCommandTemplate,
  getFeedbackSkillTemplate,
} from '../../../src/core/templates/skill-templates.js';
import { generateSkillContent } from '../../../src/core/shared/skill-generation.js';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('skill templates split parity', () => {
  it('preserves QASpec template function payloads exactly', () => {
    const functionFactories: Record<string, () => unknown> = {
      getQasAnalyzeSkillTemplate,
      getQasMatrixSkillTemplate,
      getQasPublishSkillTemplate,
      getQasArchiveSkillTemplate,
      getQasAnalyzeCommandTemplate,
      getQasMatrixCommandTemplate,
      getQasPublishCommandTemplate,
      getQasArchiveCommandTemplate,
      getFeedbackSkillTemplate,
    };

    const actualHashes = Object.fromEntries(
      Object.entries(functionFactories).map(([name, fn]) => [name, hash(stableStringify(fn()))])
    );

    expect(actualHashes).toMatchSnapshot();
  });

  it('preserves generated QASpec skill file content exactly', () => {
    const skillFactories: Array<[string, () => SkillTemplate]> = [
      ['qaspec-analyze', getQasAnalyzeSkillTemplate],
      ['qaspec-matrix', getQasMatrixSkillTemplate],
      ['qaspec-publish', getQasPublishSkillTemplate],
      ['qaspec-archive', getQasArchiveSkillTemplate],
    ];

    const actualHashes = Object.fromEntries(
      skillFactories.map(([dirName, createTemplate]) => [
        dirName,
        hash(generateSkillContent(createTemplate(), 'PARITY-BASELINE')),
      ])
    );

    expect(actualHashes).toMatchSnapshot();
  });
});
