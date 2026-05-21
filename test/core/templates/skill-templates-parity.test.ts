import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  type SkillTemplate,
  getApplyChangeSkillTemplate,
  getArchiveChangeSkillTemplate,
  getBulkArchiveChangeSkillTemplate,
  getContinueChangeSkillTemplate,
  getExploreSkillTemplate,
  getFeedbackSkillTemplate,
  getFfChangeSkillTemplate,
  getNewChangeSkillTemplate,
  getOnboardSkillTemplate,
  getOpsxApplyCommandTemplate,
  getOpsxArchiveCommandTemplate,
  getOpsxBulkArchiveCommandTemplate,
  getOpsxContinueCommandTemplate,
  getOpsxExploreCommandTemplate,
  getOpsxFfCommandTemplate,
  getOpsxNewCommandTemplate,
  getOpsxOnboardCommandTemplate,
  getOpsxSyncCommandTemplate,
  getOpsxProposeCommandTemplate,
  getOpsxProposeSkillTemplate,
  getOpsxVerifyCommandTemplate,
  getSyncSpecsSkillTemplate,
  getVerifyChangeSkillTemplate,
} from '../../../src/core/templates/skill-templates.js';
import { generateSkillContent } from '../../../src/core/shared/skill-generation.js';

const EXPECTED_FUNCTION_HASHES: Record<string, string> = {
  getExploreSkillTemplate: 'a6d735045ec0ea8200e488e1226559ada2b30755af7bbc3452859c1f9b79b4dc',
  getNewChangeSkillTemplate: '79d9144748438d5b143423060a4800392a3bd471fef34ff34a93238486f4e514',
  getContinueChangeSkillTemplate: '0d677f92c191cce1c947c49e77d65222d0d0ae59732d259a485d45452f454347',
  getApplyChangeSkillTemplate: '93d523e35df27fbb2828382c4823f540708009f073e42711eb89c76b95e74e39',
  getFfChangeSkillTemplate: '054c7c209653c1c46179424c9a342cffcb86dd20b84f7f9a759143b2c095a713',
  getSyncSpecsSkillTemplate: 'b7cc88fcde289e7b9b454f45eb746a2329b0ecf0e88c36c918ba840a5c11de26',
  getOnboardSkillTemplate: 'a2655e641a5ba8d06d2cefe58fb0b08a1c3eede081e21ac86b30576133eba69e',
  getOpsxExploreCommandTemplate: 'e4616a18d836507236229693ab600d54f31d68540e3b53c80d75623faf7cbda6',
  getOpsxNewCommandTemplate: '44403cfd755ede1095fb179e2cb2622e96dc12e969cc15cc5eb7b3259c458c19',
  getOpsxContinueCommandTemplate: 'e38df07ea5a7b660411ae75a11c1636a47d840caf085ed843b90a745002dad91',
  getOpsxApplyCommandTemplate: '6fed9129a21cba600abdaf0bb75042881984dc06cfab752f57e8a5a76f0d43b8',
  getOpsxFfCommandTemplate: '8df1a4efea067303a4def0a5fb628cc06042d1e83dfed392140b3db3c1bc5882',
  getArchiveChangeSkillTemplate: 'c5e919ade21fd412c4e587227f18c1ff5ca16a5987e9a3dc4cc29038256e142d',
  getBulkArchiveChangeSkillTemplate: 'cb8423a045c01ce03aa6fb1a8fbd98f4f429e5ff449973db96d4cfc5257cc0bb',
  getOpsxSyncCommandTemplate: '2eb279acb4cd77a3deec84a1923a19f00192d9e365030756bcfbb69eb16465d6',
  getVerifyChangeSkillTemplate: '9353da5e75b71bc43abda4eed66f08e3d8ffe09c429e07c96fe748c10b95655a',
  getOpsxArchiveCommandTemplate: 'aee8640ef119307e2c80d13f906f4d679109019c49b3ae99e4d8ebb446360328',
  getOpsxOnboardCommandTemplate: '020f7b9c1ec60256d86fd7b88baf4f92e267326d1fcc96987685ee63b5f8a696',
  getOpsxBulkArchiveCommandTemplate: '0df99ae7fd7ad1e08843fb74069ae530be7ae36ac7943bd7c670e1e26e698dcb',
  getOpsxVerifyCommandTemplate: '180718992135c8e72a6c4ca2eff93329e0948b97810b4a981d4db0384d8c8dc4',
  getOpsxProposeSkillTemplate: '819ffd1b15befedc3f9b1e67b6ffeca7edb9271458ad99272e5aecfa963a6747',
  getOpsxProposeCommandTemplate: 'a106bbb7e86fed7eede6277ac62ce3660fb9da007f4ed59984108cb8fae52e85',
  getFeedbackSkillTemplate: '8f3b0dc3b4f06a168604416690873a62c7f85f35f9832db70a667c6e1f8823de',
};

const EXPECTED_GENERATED_SKILL_CONTENT_HASHES: Record<string, string> = {
  'qas-explore': 'db66c26d9bf892f7614a1898004ccac08b66ea1d651b4c263d6ed6dfbce6169e',
  'openspec-new-change': '18cb5d9fb8dfd606f260e45247ab3b57f9ac318c63970270b5ac743201c7e0d9',
  'openspec-continue-change': 'fc706ea2d45479a77fe80db4edf47c538b9071963cbd72772f20f52d9be32dd8',
  'openspec-apply-change': 'cf2506881691922527183e669bf060eec01160de1ea3231e41875f37b91e1534',
  'openspec-ff-change': '76db27b4e9f806d415dcb25d190c6032caa709dc74bdca649dc7038ae1a66454',
  'openspec-sync-specs': 'c16775301f2484c3f87f3da1792ab863f1da633a2d1aa1eee73ba01e4cffcdd4',
  'openspec-archive-change': 'e0328c32aa7f266600497c6c7872bdaa3c48180edfd8ec4d75fd6859bffac475',
  'openspec-bulk-archive-change': 'deb5bceb1d616d994151a6b8fbcf20660561fbdd9ac87e4d54f1b066219688fa',
  'openspec-verify-change': '4f7e1b07ba697e53c061daf3c313d48d85d25f4ea3ea9e0bd7bce04ddee1e617',
  'openspec-onboard': 'f19d150c64b8a826bb06ed1142d78fa049c55142392e27a0070be60dc9a4f695',
  'openspec-propose': '57979eb305bff97f44a5c8e9f64dd9c3f70da00d79ae7a2a7a8dbd7c13069736',
};

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
  it('preserves all template function payloads exactly', () => {
    const functionFactories: Record<string, () => unknown> = {
      getExploreSkillTemplate,
      getNewChangeSkillTemplate,
      getContinueChangeSkillTemplate,
      getApplyChangeSkillTemplate,
      getFfChangeSkillTemplate,
      getSyncSpecsSkillTemplate,
      getOnboardSkillTemplate,
      getOpsxExploreCommandTemplate,
      getOpsxNewCommandTemplate,
      getOpsxContinueCommandTemplate,
      getOpsxApplyCommandTemplate,
      getOpsxFfCommandTemplate,
      getArchiveChangeSkillTemplate,
      getBulkArchiveChangeSkillTemplate,
      getOpsxSyncCommandTemplate,
      getVerifyChangeSkillTemplate,
      getOpsxArchiveCommandTemplate,
      getOpsxOnboardCommandTemplate,
      getOpsxBulkArchiveCommandTemplate,
      getOpsxVerifyCommandTemplate,
      getOpsxProposeSkillTemplate,
      getOpsxProposeCommandTemplate,
      getFeedbackSkillTemplate,
    };

    const actualHashes = Object.fromEntries(
      Object.entries(functionFactories).map(([name, fn]) => [name, hash(stableStringify(fn()))])
    );

    expect(actualHashes).toEqual(EXPECTED_FUNCTION_HASHES);
  });

  it('preserves generated skill file content exactly', () => {
    // Intentionally excludes getFeedbackSkillTemplate: skillFactories only models templates
    // deployed via generateSkillContent, while feedback is covered in function payload parity.
    const skillFactories: Array<[string, () => SkillTemplate]> = [
      ['qas-explore', getExploreSkillTemplate],
      ['openspec-new-change', getNewChangeSkillTemplate],
      ['openspec-continue-change', getContinueChangeSkillTemplate],
      ['openspec-apply-change', getApplyChangeSkillTemplate],
      ['openspec-ff-change', getFfChangeSkillTemplate],
      ['openspec-sync-specs', getSyncSpecsSkillTemplate],
      ['openspec-archive-change', getArchiveChangeSkillTemplate],
      ['openspec-bulk-archive-change', getBulkArchiveChangeSkillTemplate],
      ['openspec-verify-change', getVerifyChangeSkillTemplate],
      ['openspec-onboard', getOnboardSkillTemplate],
      ['openspec-propose', getOpsxProposeSkillTemplate],
    ];

    const actualHashes = Object.fromEntries(
      skillFactories.map(([dirName, createTemplate]) => [
        dirName,
        hash(generateSkillContent(createTemplate(), 'PARITY-BASELINE')),
      ])
    );

    expect(actualHashes).toEqual(EXPECTED_GENERATED_SKILL_CONTENT_HASHES);
  });

  it('guards unsupported workspace workflows from repo-local fallback edits', () => {
    const guardedSkills: Array<[string, () => SkillTemplate, string]> = [
      ['openspec-apply-change', getApplyChangeSkillTemplate, 'full workspace apply is not supported'],
      ['openspec-sync-specs', getSyncSpecsSkillTemplate, 'workspace spec sync is not supported'],
      ['openspec-archive-change', getArchiveChangeSkillTemplate, 'workspace archive is not supported'],
      ['openspec-bulk-archive-change', getBulkArchiveChangeSkillTemplate, 'workspace bulk archive is not supported'],
      ['openspec-verify-change', getVerifyChangeSkillTemplate, 'full workspace implementation verification is not supported'],
    ];

    for (const [dirName, createTemplate, guardText] of guardedSkills) {
      const content = generateSkillContent(createTemplate(), 'PARITY-BASELINE');

      expect(content, dirName).toContain('actionContext.mode: "workspace-planning"');
      expect(content, dirName).toContain(guardText);
      expect(content, dirName).not.toContain('openspec/changes/<name>');
      expect(content, dirName).not.toContain('mv openspec/changes');
    }
  });
});
