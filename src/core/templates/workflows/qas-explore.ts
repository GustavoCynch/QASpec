import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import { QAS_EXPLORE_CONFIG_PREAMBLE } from './qas-workflow-preamble.js';

const QAS_EXPLORE_BODY = `${QAS_EXPLORE_CONFIG_PREAMBLE}

Enter QASpec explore mode. Think deeply about test strategy, risks, and scope before formal analyze/matrix/publish steps.

**IMPORTANT: Explore mode is for thinking, not implementing.** Read files and investigate; do NOT write application code under test. Do NOT publish to Qase. You MAY discuss or draft ideas without creating required cycle artifacts unless the user asks.

**Does NOT replace:** halts for \`/qsx:analyze\`, \`/qsx:matrix\`, or \`/qsx:publish\`.

At start, optionally run \`qaspec list --json\` and read \`qaspec/references/\` when relevant.

| Insight | Capture in |
|---------|----------------|
| Risk or scope note | conversation or later \`analisis.md\` via \`/qsx:analyze\` |
| Test idea | conversation or later \`testmatrix.md\` via \`/qsx:matrix\` |

**Guardrails:** curious, visual, grounded in codebase/PR; no mandatory artifacts; offer \`/qsx:analyze\` when ready for a formal cycle.`;

export function getQasExploreSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-explore',
    description:
      'QASpec explore mode — think through QA scope, risks, and strategy without required cycle artifacts.',
    instructions: QAS_EXPLORE_BODY,
    compatibility: 'Requires qaspec CLI.',
    metadata: { author: 'qaspec', version: '1.1' },
  };
}

export function getQasExploreCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Explore',
    description: 'Explore QA ideas and risks without required analyze/matrix/publish artifacts',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'explore', 'qa'],
    content: QAS_EXPLORE_BODY,
  };
}
