import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';
import { parseDeltaSpec, type RequirementBlock } from './parsers/requirement-blocks.js';
import { LEGACY_GENERATES_ALIASES } from './artifact-graph/outputs.js';

export type CasesValidationLevel = 'error' | 'warning';

export interface CasesValidationIssue {
  level: CasesValidationLevel;
  code: string;
  message: string;
  line?: number;
}

export interface RequirementRef {
  capability: string;
  slug: string;
  key: string;
  requirementName: string;
  specPath: string;
  scenarios: ScenarioRef[];
}

export interface ScenarioRef {
  slug: string;
  key: string;
  title: string;
  line: number;
}

export interface ParsedCase {
  line: number;
  title: string;
  checked: boolean;
  reqAnnotation?: string;
  hasPreconditions: boolean;
  hasSteps: boolean;
  stepsTableValid: boolean;
  formatIssues: string[];
}

export interface CasesValidationResult {
  valid: boolean;
  errors: CasesValidationIssue[];
  warnings: CasesValidationIssue[];
  requirements: RequirementRef[];
  cases: ParsedCase[];
  coverage: {
    totalRequirements: number;
    coveredRequirements: number;
    byCapability: Record<string, { total: number; covered: number }>;
  };
}

const SCENARIO_HEADER = /^####\s+Scenario:\s*(.+)\s*$/i;
const CHECKBOX_LINE = /^-\s+\[([ xX])\]\s+(.+)$/;
const REQ_ANNOTATION = /<!--\s*req:\s*([^>]+?)\s*-->/i;
const SUITE_HEADER = /^##\s+Suite:/i;
const PRECONDITIONS_HEADER = /^\*\*Preconditions:\*\*\s*$/i;
const STEPS_HEADER = /^\*\*Steps:\*\*\s*$/i;

export function toRequirementSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toScenarioSlug(title: string): string {
  return toRequirementSlug(title);
}

function normalizeLines(content: string): string[] {
  return content.replace(/\r\n?/g, '\n').split('\n');
}

function parseScenariosFromBlock(block: RequirementBlock, capability: string, slug: string): ScenarioRef[] {
  const scenarios: ScenarioRef[] = [];
  const lines = normalizeLines(block.raw);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SCENARIO_HEADER);
    if (match) {
      const title = match[1].trim();
      scenarios.push({
        slug: toScenarioSlug(title),
        key: `${capability}/${slug}#${toScenarioSlug(title)}`,
        title,
        line: i + 1,
      });
    }
  }
  return scenarios;
}

/**
 * Parses requirement keys from change delta specs.
 */
export function parseChangeRequirements(changeDir: string): RequirementRef[] {
  const specFiles = fg
    .sync('specs/*/spec.md', { cwd: changeDir, onlyFiles: true, absolute: true })
    .sort();

  const requirements: RequirementRef[] = [];

  for (const specPath of specFiles) {
    const capability = path.basename(path.dirname(specPath));
    const content = fs.readFileSync(specPath, 'utf-8');
    const delta = parseDeltaSpec(content);
    const blocks = [...delta.added, ...delta.modified];

    for (const block of blocks) {
      const slug = toRequirementSlug(block.name);
      requirements.push({
        capability,
        slug,
        key: `${capability}/${slug}`,
        requirementName: block.name,
        specPath,
        scenarios: parseScenariosFromBlock(block, capability, slug),
      });
    }
  }

  return requirements;
}

function resolveTestcasesPath(changeDir: string): string | null {
  const primary = path.join(changeDir, 'testcases.md');
  if (fs.existsSync(primary)) {
    return primary;
  }
  const legacy = path.join(changeDir, LEGACY_GENERATES_ALIASES['testcases.md'] ?? '');
  return fs.existsSync(legacy) ? legacy : null;
}

function extractReqAnnotation(lines: string[], startIndex: number): string | undefined {
  for (let i = startIndex; i < Math.min(startIndex + 6, lines.length); i++) {
    if (PRECONDITIONS_HEADER.test(lines[i].trim()) || SUITE_HEADER.test(lines[i])) {
      break;
    }
    const match = lines[i].match(REQ_ANNOTATION);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}

function validateStepsTable(lines: string[], stepsStart: number): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  let headerIndex = -1;

  for (let i = stepsStart + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (CHECKBOX_LINE.test(trimmed) || SUITE_HEADER.test(trimmed)) {
      break;
    }
    if (trimmed.startsWith('|') && trimmed.includes('Action') && trimmed.includes('Expected')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return { valid: false, issues: ['Steps block missing Action/Expected table header'] };
  }

  let dataRowCount = 0;
  for (let i = headerIndex + 2; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      continue;
    }
    if (CHECKBOX_LINE.test(trimmed) || SUITE_HEADER.test(trimmed)) {
      break;
    }
    if (!trimmed.startsWith('|')) {
      continue;
    }
    if (/^\|[-:\s|]+\|$/.test(trimmed)) {
      continue;
    }
    const cells = trimmed.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) {
      issues.push(`Steps row at line ${i + 1} missing Action or Expected column`);
    }
    dataRowCount++;
  }

  if (dataRowCount === 0) {
    issues.push('Steps block has no data rows');
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Parses checkbox cases from testcases.md.
 */
export function parseTestcases(changeDir: string): { path: string | null; cases: ParsedCase[] } {
  const casesPath = resolveTestcasesPath(changeDir);
  if (!casesPath) {
    return { path: null, cases: [] };
  }

  const lines = normalizeLines(fs.readFileSync(casesPath, 'utf-8'));
  const cases: ParsedCase[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(CHECKBOX_LINE);
    if (!match) {
      continue;
    }

    const checked = match[1].toLowerCase() === 'x';
    const title = match[2].trim();
    const reqAnnotation = extractReqAnnotation(lines, i + 1);

    let hasPreconditions = false;
    let hasSteps = false;
    let stepsTableValid = false;
    const formatIssues: string[] = [];

    for (let j = i + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (CHECKBOX_LINE.test(trimmed) || SUITE_HEADER.test(trimmed)) {
        break;
      }
      if (PRECONDITIONS_HEADER.test(trimmed)) {
        hasPreconditions = true;
      }
      if (STEPS_HEADER.test(trimmed)) {
        hasSteps = true;
        const stepsCheck = validateStepsTable(lines, j);
        stepsTableValid = stepsCheck.valid;
        formatIssues.push(...stepsCheck.issues);
        break;
      }
    }

    if (!hasPreconditions) {
      formatIssues.push('Missing **Preconditions:** block');
    }
    if (!hasSteps) {
      formatIssues.push('Missing **Steps:** block');
    }

    cases.push({
      line: i + 1,
      title,
      checked,
      reqAnnotation,
      hasPreconditions,
      hasSteps,
      stepsTableValid,
      formatIssues,
    });
  }

  return { path: casesPath, cases };
}

function isValidReqAnnotation(value: string): boolean {
  if (value === 'gap') {
    return true;
  }
  if (value.startsWith('assumption:')) {
    return value.length > 'assumption:'.length;
  }
  return /^[a-z0-9-]+\/[a-z0-9-]+$/.test(value);
}

/**
 * Validates testcases.md against change delta specs.
 */
export function validateCases(changeDir: string): CasesValidationResult {
  const requirements = parseChangeRequirements(changeDir);
  const requirementKeys = new Set(requirements.map((r) => r.key));
  const { path: casesPath, cases } = parseTestcases(changeDir);

  const errors: CasesValidationIssue[] = [];
  const warnings: CasesValidationIssue[] = [];

  if (!casesPath) {
    errors.push({
      level: 'error',
      code: 'missing-testcases',
      message: 'testcases.md not found in change directory',
    });
    return {
      valid: false,
      errors,
      warnings,
      requirements,
      cases,
      coverage: { totalRequirements: requirements.length, coveredRequirements: 0, byCapability: {} },
    };
  }

  const coveredRequirements = new Set<string>();

  for (const testCase of cases) {
    if (!testCase.reqAnnotation) {
      errors.push({
        level: 'error',
        code: 'unannotated-case',
        message: `Case "${testCase.title}" missing <!-- req: ... --> annotation`,
        line: testCase.line,
      });
    } else if (!isValidReqAnnotation(testCase.reqAnnotation)) {
      errors.push({
        level: 'error',
        code: 'invalid-req-annotation',
        message: `Invalid req annotation "${testCase.reqAnnotation}" on case "${testCase.title}"`,
        line: testCase.line,
      });
    } else if (
      !testCase.reqAnnotation.startsWith('assumption:') &&
      testCase.reqAnnotation !== 'gap' &&
      !requirementKeys.has(testCase.reqAnnotation)
    ) {
      errors.push({
        level: 'error',
        code: 'dangling-reference',
        message: `Dangling req reference "${testCase.reqAnnotation}" on case "${testCase.title}"`,
        line: testCase.line,
      });
    } else if (
      testCase.reqAnnotation !== 'gap' &&
      !testCase.reqAnnotation.startsWith('assumption:')
    ) {
      coveredRequirements.add(testCase.reqAnnotation);
    }

    for (const issue of testCase.formatIssues) {
      errors.push({
        level: 'error',
        code: 'malformed-case',
        message: `Case "${testCase.title}" (line ${testCase.line}): ${issue}`,
        line: testCase.line,
      });
    }
  }

  for (const req of requirements) {
    if (!coveredRequirements.has(req.key)) {
      errors.push({
        level: 'error',
        code: 'uncovered-requirement',
        message: `Requirement "${req.requirementName}" (${req.key}) has no covering case`,
      });
      continue;
    }

    const casesForReq = cases.filter((c) => c.reqAnnotation === req.key);
    for (const scenario of req.scenarios) {
      const hasDedicated = casesForReq.some((c) => {
        const haystack = c.title.toLowerCase();
        return (
          haystack.includes(scenario.title.toLowerCase()) ||
          haystack.includes(scenario.slug)
        );
      });
      if (!hasDedicated) {
        warnings.push({
          level: 'warning',
          code: 'uncovered-scenario',
          message: `Scenario "${scenario.title}" (${scenario.key}) has no dedicated case`,
          line: scenario.line,
        });
      }
    }
  }

  const byCapability: Record<string, { total: number; covered: number }> = {};
  for (const req of requirements) {
    if (!byCapability[req.capability]) {
      byCapability[req.capability] = { total: 0, covered: 0 };
    }
    byCapability[req.capability].total++;
    if (coveredRequirements.has(req.key)) {
      byCapability[req.capability].covered++;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    requirements,
    cases,
    coverage: {
      totalRequirements: requirements.length,
      coveredRequirements: coveredRequirements.size,
      byCapability,
    },
  };
}

/** Resolves testcases path for external callers (publish gate). */
export function resolveTestcasesFile(changeDir: string): string | null {
  return resolveTestcasesPath(changeDir);
}
