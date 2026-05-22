export const PRODUCT_NAME = 'QASpec';
export const TAGLINE = 'Agree on what to test before you run — specs live in the repo.';
export const SUBTITLE =
  'Spec-driven QA workflow: risk analysis, test cases, and optional publish to your test management system — versioned in the repo, not lost in chat.';

export const INSTALL_COMMAND = 'npm install -g @qaspec/cli';
export const INIT_COMMAND = 'qaspec init';

export const GITHUB_REPO = 'https://github.com/GustavoCynch/QASpec';
export const DOCS_GETTING_STARTED = `${GITHUB_REPO}/blob/main/docs/getting-started.md`;
export const DOCS_SUPPORTED_TOOLS = `${GITHUB_REPO}/blob/main/docs/supported-tools.md`;
export const ISSUES_URL = `${GITHUB_REPO}/issues`;
export const PULLS_URL = `${GITHUB_REPO}/pulls`;

export const OPEN_SOURCE = {
  title: 'Open source',
  lead: 'QASpec is MIT-licensed and built in the open. Use it, fork it, and help shape what spec-driven QA becomes.',
  points: [
    'Report bugs, suggest workflows, or improve docs via GitHub Issues.',
    'Submit pull requests for CLI fixes, schemas, agent skills, and the landing site.',
    'Share feedback on TCMS connectors and real-world QA workflows — contributions and design input are welcome.',
  ],
  license: 'MIT',
} as const;

/** Placeholder until a custom domain is configured in Cloudflare. */
export const SITE_URL = 'https://qaspec-website.workers.dev';

export const WORKFLOW_COMMANDS = [
  { command: '/qsx:explore', label: 'Explore' },
  { command: '/qsx:analyze', label: 'Analyze' },
  { command: '/qsx:matrix', label: 'Matrix' },
  { command: '/qsx:publish', label: 'Publish' },
  { command: '/qsx:archive', label: 'Archive' },
] as const;

export const FEATURES = [
  {
    title: 'Review intent, not just code',
    description:
      'Each change produces structured QA artifacts — analysis, test matrix, and spec deltas — so reviewers understand what will be tested before execution.',
  },
  {
    title: 'Context that persists',
    description:
      'Specs and test plans live in your repository alongside the code. Agents read them for context; new teammates browse the library instead of digging through old chats.',
  },
  {
    title: 'Something to review in seconds',
    description:
      'Describe what you want to test; QASpec generates the change folder, tasks, and artifacts. Refine the plan before any test run.',
  },
  {
    title: 'Works with your agent',
    description:
      'Install skills and slash commands for Cursor, Claude Code, Codex, Windsurf, and dozens more via `qaspec init`.',
  },
] as const;

export const FAQ = [
  {
    question: 'How is QASpec different from ad-hoc agent planning?',
    answer:
      'Plans live in the repo across sessions and teammates. You align on what to test and why before running tests, with human approval gates on matrix and publish.',
  },
  {
    question: 'Do I need a test management system?',
    answer:
      'No. Artifacts stay in git. Today `/qsx:publish` supports Qase via MCP; more TCMS connectors are in progress.',
  },
  {
    question: 'Can I use QASpec on an existing codebase?',
    answer:
      'Yes. Run `qaspec init` in your project. Specs and changes accumulate as you work — no big-bang upfront spec generation required.',
  },
  {
    question: 'How does this relate to spec-driven dev planning?',
    answer:
      'QASpec is inspired by OpenSpec on the development side and applies the same spec-driven idea to QA.',
  },
] as const;

/** Display names for the supported-tools grid (subset; full list in docs). */
export const SUPPORTED_TOOLS = [
  'Cursor',
  'Claude Code',
  'Codex',
  'GitHub Copilot',
  'OpenCode',
  'Windsurf',
  'Gemini CLI',
  'Cline',
  'RooCode',
  'Kilo Code',
  'Amazon Q',
  'Qoder',
  'Auggie CLI',
  'Qwen Code',
  'CodeBuddy',
  'CoStrict',
  'Crush',
  'Factory Droid',
  'iFlow',
  'Antigravity',
] as const;
