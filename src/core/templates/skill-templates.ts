/**
 * Agent Skill Templates
 *
 * Compatibility facade that re-exports QASpec workflow template modules.
 */

export type { SkillTemplate, CommandTemplate } from './types.js';

export { getQasAnalyzeSkillTemplate, getQasAnalyzeCommandTemplate } from './workflows/analyze.js';
export { getQasCasesSkillTemplate, getQasCasesCommandTemplate } from './workflows/cases.js';
export { getQasPublishSkillTemplate, getQasPublishCommandTemplate } from './workflows/publish.js';
export { getQasArchiveSkillTemplate, getQasArchiveCommandTemplate } from './workflows/qas-archive.js';
export { getFeedbackSkillTemplate } from './workflows/feedback.js';
