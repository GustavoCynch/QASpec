import { stringify as stringifyYaml } from 'yaml';
import type { ProjectConfig } from './project-config.js';
import { getQaspecPrReviewConfigSeed } from './qa-config-seed.js';

const CONFIG_HEADER = `# QASpec project config
# Edit context and rules for your team. See docs/customization.md and docs/multi-language.md
`;

/** Optional footer hints appended after the active qaspec-pr-review seed (not injected into prompts). */
const QASPEC_PR_REVIEW_CONFIG_FOOTER = `
# tcms — optional user-managed DEFAULTS for /qsx:publish (uncomment and edit yourself).
# Leaving provider unset is the generic default: /qsx:publish halts once and asks you to
# choose a TCMS target per change. Set the concrete target per change with \`qaspec tcms set\`
# (publish never writes this block). Fill this in only when every change targets the same project.
# tcms:
#   provider: YOUR_TCMS_PROVIDER   # the provider id your MCP server supports
#   project: YOUR_PROJECT_CODE
#   baseUrl: https://your-tcms.example.com
#
# execution — settings for /qsx:execute (agent-driven browser runs). Uncomment and edit.
# Paths are relative to the project root. Keep envFile and storageState out of git (.gitignore):
# they hold the test credentials and a logged-in browser session.
# execution:
#   app:
#     url: https://app.example.test          # app under test, serving the change's code
#     readiness: manual                      # manual: you confirm the app is ready; probe: GET probeUrl must return 2xx
#     # probeUrl: https://app.example.test/health
#   auth:
#     envFile: .env.qa                       # dotenv file with the test credentials
#     requiredVariables: [QA_USERNAME, QA_PASSWORD]
#     loginScript: qaspec/scripts/login.mjs  # logs in and writes storageState; the agent never sees the password
#     storageState: .qaspec/auth/storage-state.json
#   network:
#     blockedOrigins:                        # origins the agent's browser must never reach (e.g. production)
#       - https://production.example.test
#   controlCase: qaspec/references/control-case.md   # smoke case run at the start and end of every run
#   readinessChecks:                         # commands that must exit 0 before cases run
#     - name: backend-deployed
#       command: ./scripts/check-backend-deployed.sh
#   dataPrefix: QASPEC                       # prefix for data the agent creates
#
# catch — settings for /qsx:catch (tests generated for a PR's change). Uncomment and edit.
# Paths are relative to the project root. Commands run with your permissions in a worktree
# outside the project; QASpec does not sandbox them, so pass only the environment they need (env).
# catch:
#   baseRef: origin/main                        # base the PR is compared with (parent = merge-base with the head)
#   setup:
#     commands: [npm ci]                        # install commands, run in the worktree in order
#     reinstallWhenChanged: [package-lock.json] # reinstall only when the child differs in these paths
#     timeoutSeconds: 900
#   runner:
#     adapter: jest
#     command: npx jest                         # base test command the adapter runs
#     timeoutSeconds: 300
#   env:
#     inherit: [CI]                             # variables passed from your environment, on top of the built-in ones
#     set:
#       TZ: UTC                                 # explicit values passed to the child processes
#   gates:
#     parentRuns: 5                             # passing runs of a catching test on the parent
#     childRuns: 3                              # repeats of a child failure, to rule out flakiness
#   judges: 3                                   # odd number from 1 to 9: judges that may only discard findings
#   rulesFile: qaspec/references/catch-rules.yaml # per-project assessor rules (YAML: rules: [{ id, kind, match, reason }])
#
# workflow.multipleSubagents.review — dual Task analysts for /qsx:analyze (default: false)
# workflow.multipleSubagents.cases — dual Task analysts for /qsx:cases (default: false)
# When false, the orchestrator does the phase with no Task subagents (not a single subagent).
#
# Extend context above with your own details (shown to AI on every artifact):
#   - Tech stack, architectures, integrations, test tools
#   - Conventions, style guides, environment names, doc links
#   - Domain knowledge and high-risk areas for this product
# Example (add inside context: | or replace the Stack/Domain lines):
#   Stack: TypeScript monorepo, REST APIs, Playwright
#   Domain: billing and subscriptions — stress refunds and proration
`;

/**
 * Serialize config to YAML string with helpful comments.
 *
 * @param config - Partial config object (schema required, context/rules optional)
 * @returns YAML string ready to write to file
 */
export function serializeConfig(config: Partial<ProjectConfig>): string {
  const schema = config.schema;
  if (!schema) {
    throw new Error('serializeConfig requires schema');
  }

  const merged: Partial<ProjectConfig> =
    schema === 'qaspec-pr-review'
      ? { ...getQaspecPrReviewConfigSeed(), ...config, schema }
      : { ...config, schema };

  if (merged.context || merged.rules || merged.workflow) {
    const body: Record<string, unknown> = { schema: merged.schema };
    if (merged.context) {
      body.context = merged.context;
    }
    if (merged.workflow) {
      body.workflow = merged.workflow;
    }
    if (merged.rules) {
      body.rules = merged.rules;
    }
    const yaml = CONFIG_HEADER + stringifyYaml(body);
    return schema === 'qaspec-pr-review' ? yaml + QASPEC_PR_REVIEW_CONFIG_FOOTER : yaml;
  }

  const lines: string[] = [];

  lines.push(`schema: ${schema}`);
  lines.push('');

  lines.push('# Project context (optional)');
  lines.push('# This is shown to AI when creating artifacts.');
  lines.push('# Add your tech stack, conventions, style guides, domain knowledge, etc.');
  lines.push('');

  lines.push('# Per-artifact rules (optional)');
  lines.push('# Add custom rules for specific artifacts.');
  lines.push('# Example:');
  lines.push('#   rules:');
  lines.push('#     proposal:');
  lines.push('#       - Keep proposals under 500 words');

  return lines.join('\n') + '\n';
}
