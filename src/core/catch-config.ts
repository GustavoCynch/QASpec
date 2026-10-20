import { z } from 'zod';
import {
  PATH_EXPECTATION,
  ProjectRelativePathSchema,
  compact,
  readField,
  readList,
  readSection,
} from './execution-config.js';

/**
 * Zod schema for the optional `catch` block of qaspec/config.yaml, used by /qsx:catch.
 *
 * Every value is project-specific (base ref, install and test commands, environment names,
 * rules file), so none of it is hardcoded in QASpec. Paths are relative to the project root
 * and must stay inside it, as in the execution block. The schema documents the block; the
 * defaults are applied by parseCatchConfig.
 */

const BASE_REF_EXPECTATION = 'a git ref without whitespace that does not start with -';
const SHELL_COMMAND_EXPECTATION = 'a non-empty shell command';
const ENV_NAME_EXPECTATION = 'an environment variable name';
const POSITIVE_INTEGER_EXPECTATION = 'a positive integer';
const GATE_RUNS_EXPECTATION = 'an integer from 1 to 20';
const JUDGES_EXPECTATION = 'an odd integer from 1 to 9';

const DEFAULT_SETUP_TIMEOUT_SECONDS = 900;
const DEFAULT_RUNNER_TIMEOUT_SECONDS = 300;
const DEFAULT_PARENT_RUNS = 5;
const DEFAULT_CHILD_RUNS = 3;
const DEFAULT_JUDGES = 3;

/** Git passes the base ref as an argument, so whitespace and a leading dash are rejected. */
const BaseRefSchema = z
  .string()
  .min(1)
  .refine((value) => !/\s/.test(value) && !value.startsWith('-'));
const ShellCommandSchema = z.string().refine((value) => value.trim().length > 0);
const EnvNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const RunnerAdapterSchema = z.enum(['jest']);
const PositiveIntegerSchema = z.number().int().positive();
const GateRunsSchema = z.number().int().min(1).max(20);
const JudgesSchema = z
  .number()
  .int()
  .min(1)
  .max(9)
  .refine((value) => value % 2 === 1);

export const CatchConfigSchema = z.object({
  baseRef: BaseRefSchema.optional().describe(
    'Base ref the PR is compared with; the parent is merge-base(baseRef, approved head)'
  ),
  setup: z
    .object({
      commands: z.array(ShellCommandSchema).optional().describe('Install commands, run in the worktree in order'),
      reinstallWhenChanged: z
        .array(ProjectRelativePathSchema)
        .optional()
        .describe('Reinstall only when the child differs from the parent in these paths, for example a lockfile'),
      timeoutSeconds: PositiveIntegerSchema.optional().describe('Timeout per setup command (default 900)'),
    })
    .optional(),
  runner: z
    .object({
      adapter: RunnerAdapterSchema.optional().describe('Test-runner adapter'),
      command: ShellCommandSchema.optional().describe('Base test command the adapter runs'),
      timeoutSeconds: PositiveIntegerSchema.optional().describe('Timeout per test run (default 300)'),
    })
    .optional(),
  env: z
    .object({
      inherit: z
        .array(EnvNameSchema)
        .optional()
        .describe('Variables passed to child processes from the environment, on top of the built-in allowlist'),
      set: z
        .record(EnvNameSchema, z.string())
        .optional()
        .describe('Explicit values passed to child processes'),
    })
    .optional(),
  gates: z
    .object({
      parentRuns: GateRunsSchema.optional().describe('Passing runs of a catching test on the parent (default 5)'),
      childRuns: GateRunsSchema.optional().describe('Repeats of a child failure, to rule out flakiness (default 3)'),
    })
    .optional(),
  judges: JudgesSchema.optional().describe('Fresh-context judges that may only discard findings (default 3)'),
  rulesFile: ProjectRelativePathSchema.optional().describe('Per-project assessor rules file'),
});

export type CatchConfig = z.infer<typeof CatchConfigSchema>;

/** Reads env.set entry by entry: a name must be a variable name and a value must be a string. */
function readEnvSet(value: unknown): Record<string, string> | undefined {
  const entries = readSection(value, 'catch.env.set');
  if (!entries) {
    return undefined;
  }
  const valid: [string, string][] = [];
  for (const [name, entry] of Object.entries(entries)) {
    const label = `catch.env.set.${name}`;
    if (readField(name, EnvNameSchema, label, ENV_NAME_EXPECTATION) === undefined) {
      continue;
    }
    const parsed = readField(entry, z.string(), label, 'a string');
    if (parsed !== undefined) {
      valid.push([name, parsed]);
    }
  }
  // Object.fromEntries keeps names such as __proto__ as own properties; plain assignment would not.
  return valid.length > 0 ? Object.fromEntries(valid) : undefined;
}

/**
 * Resilient parsing of the `catch` block, field by field, like the execution block: invalid
 * values are reported with console.warn and dropped; valid siblings are kept. Unlike the
 * execution block, defaults are applied here: an absent block returns undefined, while an
 * object-valued block always returns every defaulted field.
 */
export function parseCatchConfig(raw: unknown): CatchConfig | undefined {
  const section = readSection(raw, 'catch');
  if (!section) {
    return undefined;
  }

  const setupRaw = readSection(section.setup, 'catch.setup');
  const runnerRaw = readSection(section.runner, 'catch.runner');
  const envRaw = readSection(section.env, 'catch.env');
  const gatesRaw = readSection(section.gates, 'catch.gates');

  return compact({
    baseRef: readField(section.baseRef, BaseRefSchema, 'catch.baseRef', BASE_REF_EXPECTATION),
    setup: compact({
      commands: readList(setupRaw?.commands, ShellCommandSchema, 'catch.setup.commands', SHELL_COMMAND_EXPECTATION),
      reinstallWhenChanged: readList(
        setupRaw?.reinstallWhenChanged,
        ProjectRelativePathSchema,
        'catch.setup.reinstallWhenChanged',
        PATH_EXPECTATION
      ),
      timeoutSeconds:
        readField(
          setupRaw?.timeoutSeconds,
          PositiveIntegerSchema,
          'catch.setup.timeoutSeconds',
          POSITIVE_INTEGER_EXPECTATION
        ) ?? DEFAULT_SETUP_TIMEOUT_SECONDS,
    }),
    runner: compact({
      adapter: readField(runnerRaw?.adapter, RunnerAdapterSchema, 'catch.runner.adapter', "'jest'"),
      command: readField(runnerRaw?.command, ShellCommandSchema, 'catch.runner.command', SHELL_COMMAND_EXPECTATION),
      timeoutSeconds:
        readField(
          runnerRaw?.timeoutSeconds,
          PositiveIntegerSchema,
          'catch.runner.timeoutSeconds',
          POSITIVE_INTEGER_EXPECTATION
        ) ?? DEFAULT_RUNNER_TIMEOUT_SECONDS,
    }),
    env: compact({
      inherit: readList(envRaw?.inherit, EnvNameSchema, 'catch.env.inherit', ENV_NAME_EXPECTATION),
      set: readEnvSet(envRaw?.set),
    }),
    gates: compact({
      parentRuns:
        readField(gatesRaw?.parentRuns, GateRunsSchema, 'catch.gates.parentRuns', GATE_RUNS_EXPECTATION) ??
        DEFAULT_PARENT_RUNS,
      childRuns:
        readField(gatesRaw?.childRuns, GateRunsSchema, 'catch.gates.childRuns', GATE_RUNS_EXPECTATION) ??
        DEFAULT_CHILD_RUNS,
    }),
    judges: readField(section.judges, JudgesSchema, 'catch.judges', JUDGES_EXPECTATION) ?? DEFAULT_JUDGES,
    rulesFile: readField(section.rulesFile, ProjectRelativePathSchema, 'catch.rulesFile', PATH_EXPECTATION),
  });
}
