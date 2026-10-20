import { Command } from 'commander';
import { createRequire } from 'module';
import ora from 'ora';
import path from 'path';
import { promises as fs } from 'fs';
import { AI_TOOLS } from '../core/config.js';
import { UpdateCommand } from '../core/update.js';
import { ListCommand } from '../core/list.js';
import { ArchiveCommand } from '../core/archive.js';
import { ViewCommand } from '../core/view.js';
import { registerSpecCommand } from '../commands/spec.js';
import { ChangeCommand } from '../commands/change.js';
import { ValidateCommand } from '../commands/validate.js';
import { ShowCommand } from '../commands/show.js';
import { CompletionCommand } from '../commands/completion.js';
import { FeedbackCommand } from '../commands/feedback.js';
import { registerConfigCommand } from '../commands/config.js';
import { registerSchemaCommand } from '../commands/schema.js';
import {
  registerWorkspaceCommand,
  runWorkspaceUpdateForRoot,
} from '../commands/workspace.js';
import { findWorkspaceRoot } from '../core/workspace/index.js';
import {
  statusCommand,
  instructionsCommand,
  applyInstructionsCommand,
  templatesCommand,
  schemasCommand,
  newChangeCommand,
  DEFAULT_SCHEMA,
  type StatusOptions,
  type InstructionsOptions,
  type TemplatesOptions,
  type SchemasOptions,
  type NewChangeOptions,
} from '../commands/workflow/index.js';
import { approveCommand } from '../commands/approve.js';
import { validateCasesCommand } from '../commands/validate-cases.js';
import { publishGateCommand } from '../commands/publish-gate.js';
import { tcmsSetCommand, tcmsShowCommand } from '../commands/tcms.js';
import {
  executeAnswerCommand,
  executeCheckCommand,
  executeConfirmCommand,
  executeFinishCommand,
  executeLoginCommand,
  executePlanCommand,
  executeRecordCommand,
  executeResultsCommand,
  executeResultsGateCommand,
  executeStartCommand,
  executeStatusCommand,
  executeTcmsMapCommand,
  executeTriageCommand,
  executeTriageContextCommand,
  executeValidatePlanCommand,
} from '../commands/execute.js';
import {
  catchAnswerCommand,
  catchAssessCommand,
  catchChildCommand,
  catchContextCommand,
  catchEquivalenceCommand,
  catchFinishCommand,
  catchIntentCommand,
  catchJudgeCommand,
  catchMutantCommand,
  catchReportCommand,
  catchRiskCommand,
  catchStartCommand,
  catchStatusCommand,
  catchTestCommand,
} from '../commands/catch.js';
import { catchLandCommand, catchLandedCommand } from '../commands/catch-land.js';
const program = new Command();
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const CLI_PROGRAM_NAME = 'qaspec';

program
  .name(CLI_PROGRAM_NAME)
  .description('QASpec — AI-native QA planning and spec-driven workflows')
  .version(version);

// Global options
program.option('--no-color', 'Disable color output');

// Apply global flags before any command runs
program.hook('preAction', async (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.color === false) {
    process.env.NO_COLOR = '1';
  }
});

const availableToolIds = AI_TOOLS.filter((tool) => tool.skillsDir).map((tool) => tool.value);
const toolsOptionDescription = `Configure AI tools non-interactively. Use "all", "none", or a comma-separated list of: ${availableToolIds.join(', ')}`;

program
  .command('init [path]')
  .description('Initialize QASpec in your project')
  .option('--tools <tools>', toolsOptionDescription)
  .option('--force', 'Auto-cleanup legacy files without prompting')
  .option('--profile <profile>', 'Override global config profile (core or custom)')
  .action(async (targetPath = '.', options?: { tools?: string; force?: boolean; profile?: string }) => {
    try {
      // Validate that the path is a valid directory
      const resolvedPath = path.resolve(targetPath);

      try {
        const stats = await fs.stat(resolvedPath);
        if (!stats.isDirectory()) {
          throw new Error(`Path "${targetPath}" is not a directory`);
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // Directory doesn't exist, but we can create it
          console.log(`Directory "${targetPath}" doesn't exist, it will be created.`);
        } else if (error.message && error.message.includes('not a directory')) {
          throw error;
        } else {
          throw new Error(`Cannot access path "${targetPath}": ${error.message}`);
        }
      }

      const { InitCommand } = await import('../core/init.js');
      const initCommand = new InitCommand({
        tools: options?.tools,
        force: options?.force,
        profile: options?.profile,
      });
      await initCommand.execute(targetPath);
    } catch (error) {
      console.log(); // Empty line for spacing
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Hidden alias: 'experimental' -> 'init' for backwards compatibility
program
  .command('experimental', { hidden: true })
  .description('Alias for init (deprecated)')
  .option('--tool <tool-id>', 'Target AI tool (maps to --tools)')
  .option('--no-interactive', 'Disable interactive prompts')
  .action(async (options?: { tool?: string; noInteractive?: boolean }) => {
    try {
      console.log('Note: "qaspec experimental" is deprecated. Use "qaspec init" instead.');
      const { InitCommand } = await import('../core/init.js');
      const initCommand = new InitCommand({
        tools: options?.tool,
        interactive: options?.noInteractive === true ? false : undefined,
      });
      await initCommand.execute('.');
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('update [path]')
  .description('Update QASpec instruction files')
  .option('--force', 'Force update even when tools are up to date')
  .action(async (targetPath = '.', options?: { force?: boolean }) => {
    try {
      const resolvedPath = path.resolve(targetPath);
      const workspaceRoot = await findWorkspaceRoot(resolvedPath);
      if (workspaceRoot) {
        await runWorkspaceUpdateForRoot(workspaceRoot, { force: options?.force });
        return;
      }

      const updateCommand = new UpdateCommand({ force: options?.force });
      await updateCommand.execute(resolvedPath);
    } catch (error) {
      console.log(); // Empty line for spacing
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List items (changes by default). Use --specs to list specs.')
  .option('--specs', 'List specs instead of changes')
  .option('--changes', 'List changes explicitly (default)')
  .option('--sort <order>', 'Sort order: "recent" (default) or "name"', 'recent')
  .option('--json', 'Output as JSON (for programmatic use)')
  .action(async (options?: { specs?: boolean; changes?: boolean; sort?: string; json?: boolean }) => {
    try {
      const listCommand = new ListCommand();
      const mode: 'changes' | 'specs' = options?.specs ? 'specs' : 'changes';
      const sort = options?.sort === 'name' ? 'name' : 'recent';
      await listCommand.execute('.', mode, { sort, json: options?.json });
    } catch (error) {
      console.log(); // Empty line for spacing
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('view')
  .description('Display an interactive dashboard of specs and changes')
  .action(async () => {
    try {
      const viewCommand = new ViewCommand();
      await viewCommand.execute('.');
    } catch (error) {
      console.log(); // Empty line for spacing
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Change command with subcommands
const changeCmd = program
  .command('change')
  .description('Manage QASpec change proposals');

// Deprecation notice for noun-based commands
changeCmd.hook('preAction', () => {
  console.error('Warning: The "qaspec change ..." commands are deprecated. Prefer verb-first commands (e.g., "qaspec list", "qaspec validate --changes").');
});

changeCmd
  .command('show [change-name]')
  .description('Show a change proposal in JSON or markdown format')
  .option('--json', 'Output as JSON')
  .option('--deltas-only', 'Show only deltas (JSON only)')
  .option('--requirements-only', 'Alias for --deltas-only (deprecated)')
  .option('--no-interactive', 'Disable interactive prompts')
  .action(async (changeName?: string, options?: { json?: boolean; requirementsOnly?: boolean; deltasOnly?: boolean; noInteractive?: boolean }) => {
    try {
      const changeCommand = new ChangeCommand();
      await changeCommand.show(changeName, options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

changeCmd
  .command('list')
  .description('List all active changes (DEPRECATED: use "qaspec list" instead)')
  .option('--json', 'Output as JSON')
  .option('--long', 'Show id and title with counts')
  .action(async (options?: { json?: boolean; long?: boolean }) => {
    try {
      console.error('Warning: "qaspec change list" is deprecated. Use "qaspec list".');
      const changeCommand = new ChangeCommand();
      await changeCommand.list(options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

changeCmd
  .command('validate [change-name]')
  .description('Validate a change proposal')
  .option('--strict', 'Enable strict validation mode')
  .option('--json', 'Output validation report as JSON')
  .option('--no-interactive', 'Disable interactive prompts')
  .action(async (changeName?: string, options?: { strict?: boolean; json?: boolean; noInteractive?: boolean }) => {
    try {
      const changeCommand = new ChangeCommand();
      await changeCommand.validate(changeName, options);
      if (typeof process.exitCode === 'number' && process.exitCode !== 0) {
        process.exit(process.exitCode);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command('archive [change-name]')
  .description('Archive a completed change and update main specs')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--skip-specs', 'Skip spec update operations (useful for infrastructure, tooling, or doc-only changes)')
  .option('--no-validate', 'Skip validation (not recommended, requires confirmation)')
  .action(async (changeName?: string, options?: { yes?: boolean; skipSpecs?: boolean; noValidate?: boolean; validate?: boolean }) => {
    try {
      const archiveCommand = new ArchiveCommand();
      await archiveCommand.execute(changeName, options);
    } catch (error) {
      console.log(); // Empty line for spacing
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

registerSpecCommand(program);
registerConfigCommand(program);
registerSchemaCommand(program);
registerWorkspaceCommand(program);

// Top-level validate command
program
  .command('validate [item-name]')
  .description('Validate changes and specs (use "validate cases" for testcases coverage)')
  .option('--change <id>', 'Change name (required for validate cases)')
  .option('--all', 'Validate all changes and specs')
  .option('--changes', 'Validate all changes')
  .option('--specs', 'Validate all specs')
  .option('--type <type>', 'Specify item type when ambiguous: change|spec')
  .option('--strict', 'Enable strict validation mode')
  .option('--json', 'Output validation results as JSON')
  .option('--concurrency <n>', 'Max concurrent validations (defaults to env QASPEC_CONCURRENCY or 6)')
  .option('--no-interactive', 'Disable interactive prompts')
  .action(async (itemName?: string, options?: { change?: string; all?: boolean; changes?: boolean; specs?: boolean; type?: string; strict?: boolean; json?: boolean; noInteractive?: boolean; concurrency?: string }) => {
    try {
      if (itemName === 'cases') {
        await validateCasesCommand({ change: options?.change, json: options?.json });
        if (typeof process.exitCode === 'number' && process.exitCode !== 0) {
          process.exit(process.exitCode);
        }
        return;
      }
      const validateCommand = new ValidateCommand();
      await validateCommand.execute(itemName, options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Top-level show command
program
  .command('show [item-name]')
  .description('Show a change or spec')
  .option('--json', 'Output as JSON')
  .option('--type <type>', 'Specify item type when ambiguous: change|spec')
  .option('--no-interactive', 'Disable interactive prompts')
  // change-only flags
  .option('--deltas-only', 'Show only deltas (JSON only, change)')
  .option('--requirements-only', 'Alias for --deltas-only (deprecated, change)')
  // spec-only flags
  .option('--requirements', 'JSON only: Show only requirements (exclude scenarios)')
  .option('--no-scenarios', 'JSON only: Exclude scenario content')
  .option('-r, --requirement <id>', 'JSON only: Show specific requirement by ID (1-based)')
  // allow unknown options to pass-through to underlying command implementation
  .allowUnknownOption(true)
  .action(async (itemName?: string, options?: { json?: boolean; type?: string; noInteractive?: boolean; [k: string]: any }) => {
    try {
      const showCommand = new ShowCommand();
      await showCommand.execute(itemName, options ?? {});
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Feedback command
program
  .command('feedback <message>')
  .description('Submit feedback about QASpec')
  .option('--body <text>', 'Detailed description for the feedback')
  .action(async (message: string, options?: { body?: string }) => {
    try {
      const feedbackCommand = new FeedbackCommand();
      await feedbackCommand.execute(message, options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Completion command with subcommands
const completionCmd = program
  .command('completion')
  .description('Manage shell completions for QASpec CLI');

completionCmd
  .command('generate [shell]')
  .description('Generate completion script for a shell (outputs to stdout)')
  .action(async (shell?: string) => {
    try {
      const completionCommand = new CompletionCommand();
      await completionCommand.generate({ shell });
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

completionCmd
  .command('install [shell]')
  .description('Install completion script for a shell')
  .option('--verbose', 'Show detailed installation output')
  .action(async (shell?: string, options?: { verbose?: boolean }) => {
    try {
      const completionCommand = new CompletionCommand();
      await completionCommand.install({ shell, verbose: options?.verbose });
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

completionCmd
  .command('uninstall [shell]')
  .description('Uninstall completion script for a shell')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (shell?: string, options?: { yes?: boolean }) => {
    try {
      const completionCommand = new CompletionCommand();
      await completionCommand.uninstall({ shell, yes: options?.yes });
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Hidden command for machine-readable completion data
program
  .command('__complete <type>', { hidden: true })
  .description('Output completion data in machine-readable format (internal use)')
  .action(async (type: string) => {
    try {
      const completionCommand = new CompletionCommand();
      await completionCommand.complete({ type });
    } catch (error) {
      // Silently fail for graceful shell completion experience
      process.exitCode = 1;
    }
  });

// ═══════════════════════════════════════════════════════════
// Workflow Commands (formerly experimental)
// ═══════════════════════════════════════════════════════════

// Status command
program
  .command('status')
  .description('Display artifact completion status for a change')
  .option('--change <id>', 'Change name to show status for')
  .option('--schema <name>', 'Schema override (auto-detected from config.yaml)')
  .option('--head-sha <sha>', 'PR head SHA for approval verification (qaspec-pr-review)')
  .option('--json', 'Output as JSON')
  .action(async (options: StatusOptions) => {
    try {
      await statusCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Instructions command
program
  .command('instructions [artifact]')
  .description('Output enriched instructions for creating an artifact or applying tasks')
  .option('--change <id>', 'Change name')
  .option('--schema <name>', 'Schema override (auto-detected from config.yaml)')
  .option('--json', 'Output as JSON')
  .action(async (artifactId: string | undefined, options: InstructionsOptions) => {
    try {
      // Special case: "apply" is not an artifact, but a command to get apply instructions
      if (artifactId === 'apply') {
        await applyInstructionsCommand(options);
      } else {
        await instructionsCommand(artifactId, options);
      }
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Templates command
program
  .command('templates')
  .description('Show resolved template paths for all artifacts in a schema')
  .option('--schema <name>', `Schema to use (default: ${DEFAULT_SCHEMA})`)
  .option('--json', 'Output as JSON mapping artifact IDs to template paths')
  .action(async (options: TemplatesOptions) => {
    try {
      await templatesCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Schemas command
program
  .command('schemas')
  .description('List available workflow schemas with descriptions')
  .option('--json', 'Output as JSON (for agent use)')
  .action(async (options: SchemasOptions) => {
    try {
      await schemasCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// New command group with change subcommand
const newCmd = program.command('new').description('Create new items');

newCmd
  .command('change <name>')
  .description('Create a new change directory')
  .option('--goal <text>', 'Workspace product goal to store with the change')
  .option('--areas <names>', 'Comma-separated affected workspace link names')
  .option('--schema <name>', `Workflow schema to use (default: ${DEFAULT_SCHEMA})`)
  .action(async (name: string, options: NewChangeOptions) => {
    try {
      await newChangeCommand(name, options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Publish gate — precondition check before TCMS upload
program
  .command('publish-gate')
  .description('Verify approval, cases validation, and TCMS target before publish')
  .requiredOption('--change <id>', 'Change name')
  .option('--head-sha <sha>', 'PR head SHA for approval verification')
  .option('--json', 'Output gate result as JSON')
  .action(async (options: { change: string; headSha?: string; json?: boolean }) => {
    try {
      await publishGateCommand(options);
      if (typeof process.exitCode === 'number' && process.exitCode !== 0) {
        process.exit(process.exitCode);
      }
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// TCMS target — per-change publish target stored in the change metadata
const tcmsCmd = program
  .command('tcms')
  .description('Manage the per-change TCMS publish target');

tcmsCmd
  .command('set')
  .description('Persist the TCMS target (provider, project, base URL) for a change')
  .requiredOption('--change <id>', 'Change name')
  .option('--provider <provider>', 'TCMS provider (any MCP-backed provider)')
  .option('--project <code>', 'TCMS project code')
  .option('--base-url <url>', 'Base URL for test navigation steps')
  .option('--json', 'Output as JSON')
  .action(
    async (options: {
      change: string;
      provider?: string;
      project?: string;
      baseUrl?: string;
      json?: boolean;
    }) => {
      try {
        await tcmsSetCommand(options);
      } catch (error) {
        console.log();
        ora().fail(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    }
  );

tcmsCmd
  .command('show')
  .description('Show the resolved TCMS target for a change (change metadata over config defaults)')
  .requiredOption('--change <id>', 'Change name')
  .option('--json', 'Output as JSON')
  .action(async (options: { change: string; json?: boolean }) => {
    try {
      await tcmsShowCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Execute — support commands for agent-driven browser runs of approved test cases
const executeCmd = program
  .command('execute')
  .description('Prepare agent-driven browser runs of approved test cases');

executeCmd
  .command('login')
  .description(
    'Run the configured login script and save the browser session (the agent never receives the credentials)'
  )
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    try {
      await executeLoginCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('validate-plan')
  .description('Validate an execution plan against the Steps of its case in testcases.md (nothing is executed)')
  .argument('<plan>', 'Execution plan JSON file')
  .requiredOption('--change <id>', 'Change name')
  .option('--json', 'Output as JSON')
  .action(async (plan: string, options: { change: string; json?: boolean }) => {
    try {
      await executeValidatePlanCommand(plan, options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('check')
  .description('Evaluate captured observations against a validated plan and print the case verdict')
  .argument('<plan>', 'Execution plan JSON file')
  .argument('<observations>', 'Observations JSON file')
  .option('--json', 'Output as JSON')
  .action(async (plan: string, observations: string, options: { json?: boolean }) => {
    try {
      await executeCheckCommand(plan, observations, options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('start')
  .description(
    'Start an execution run for a change: checks approval, cases, config, git guards, readiness and the control case'
  )
  .requiredOption('--change <id>', 'Change name')
  .option('--json', 'Output as JSON')
  .action(async (options: { change: string; json?: boolean }) => {
    try {
      await executeStartCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('confirm')
  .description('Record that the user confirmed the app serves the change (manual readiness)')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await executeConfirmCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('plan')
  .description('Store the execution plan for one case before it runs (a stored plan cannot be replaced)')
  .argument('<plan>', 'Execution plan JSON file')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .requiredOption('--case <id>', 'Testcase id such as 1.1, or control')
  .option('--json', 'Output as JSON')
  .action(async (plan: string, options: { run: string; case: string; json?: boolean }) => {
    try {
      await executePlanCommand(plan, options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('record')
  .description(
    'Evaluate observations against the stored plan of a case: failed or incomplete cases get one retry, then needs-triage'
  )
  .argument('<observations>', 'Observations JSON file')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .requiredOption('--case <id>', 'Testcase id such as 1.1, or control')
  .option('--json', 'Output as JSON')
  .action(async (observations: string, options: { run: string; case: string; json?: boolean }) => {
    try {
      await executeRecordCommand(observations, options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('finish')
  .description('Close a run: completed when the control case passed at the start and the end, otherwise environment-noise')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await executeFinishCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('status')
  .description('Show one run (--run) or list the runs of a change (--change)')
  .option('--run <id>', 'Run id printed by execute start')
  .option('--change <id>', 'Change name, to list its runs')
  .option('--json', 'Output as JSON')
  .action(async (options: { run?: string; change?: string; json?: boolean }) => {
    try {
      await executeStatusCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('triage-context')
  .description('Show the judge input for a case that needs triage: case text, stored plan, attempts, evidence, readiness')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .requiredOption('--case <id>', 'Testcase id such as 1.1, or control')
  .option('--json', 'Output the full judge input as JSON')
  .action(async (options: { run: string; case: string; json?: boolean }) => {
    try {
      await executeTriageContextCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('triage')
  .description('Record the judge classification of a case that needs triage (once per case; app creates a finding)')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .requiredOption('--case <id>', 'Testcase id such as 1.1, or control')
  .option('--input <file>', 'Judgement JSON file: classification, rationale, expected, observed (instead of the flags)')
  .option('--classification <kind>', 'agent, environment or app (required without --input)')
  .option('--rationale <text>', 'Why the judge chose this classification (required without --input)')
  .option('--expected <text>', 'What the case expects (app only, required)')
  .option('--observed <text>', 'What the run observed (app only, required)')
  .option('--json', 'Output as JSON')
  .action(
    async (options: {
      run: string;
      case: string;
      input?: string;
      classification?: string;
      rationale?: string;
      expected?: string;
      observed?: string;
      json?: boolean;
    }) => {
      try {
        await executeTriageCommand(options);
      } catch (error) {
        console.log();
        ora().fail(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    }
  );

executeCmd
  .command('answer')
  .description('Record the answer to a finding: --intended yes dismisses it, --intended no confirms it (once)')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .requiredOption('--finding <id>', 'Finding id such as F1')
  .requiredOption('--intended <yes|no>', 'Whether the behavior is intended')
  .option('--note <text>', 'Optional note from the person')
  .option('--note-file <file>', 'Optional note from the person, read from a plain text file (instead of --note)')
  .option('--json', 'Output as JSON')
  .action(
    async (options: {
      run: string;
      finding: string;
      intended: string;
      note?: string;
      noteFile?: string;
      json?: boolean;
    }) => {
      try {
        await executeAnswerCommand(options);
      } catch (error) {
        console.log();
        ora().fail(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    }
  );

executeCmd
  .command('results')
  .description('Print the TCMS results of a finished run: one entry per testcase, control cases excluded')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await executeResultsCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('results-gate')
  .description('Check that the run can be reported to TCMS and print the gate token the workflow cites before any TCMS write')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await executeResultsGateCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

executeCmd
  .command('tcms-map')
  .description('Record the TCMS id of one case title in the run (a title keeps one id; status --json shows the mapping)')
  .requiredOption('--run <id>', 'Run id printed by execute start')
  .option('--title <text>', 'Case title: the checkbox text after the case number, as written in testcases.md')
  .option('--title-file <file>', 'Case title read from a plain text file, one line (instead of --title)')
  .requiredOption('--tcms-id <id>', 'Case id in the TCMS')
  .option('--tcms-run <id>', 'Run id in the TCMS, recorded once per run')
  .option('--json', 'Output as JSON')
  .action(
    async (options: {
      run: string;
      title?: string;
      titleFile?: string;
      tcmsId: string;
      tcmsRun?: string;
      json?: boolean;
    }) => {
      try {
        await executeTcmsMapCommand(options);
      } catch (error) {
        console.log();
        ora().fail(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    }
  );

// Catch — support commands for /qsx:catch (catching tests generated from the approved change intent)
const catchCmd = program
  .command('catch')
  .description('Generate catching tests for a PR from the approved change intent');

catchCmd
  .command('intent')
  .description(
    'Print the change intent (intent class and per-requirement map) from the approved analysis and delta specs (nothing is written)'
  )
  .requiredOption('--change <id>', 'Change name')
  .option('--json', 'Output as JSON')
  .action(async (options: { change: string; json?: boolean }) => {
    try {
      await catchIntentCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('start')
  .description(
    'Start a catch run for a change: checks the approval, intent, catch config and revisions, then creates the worktree and runs catch.setup (a refusal creates nothing)'
  )
  .requiredOption('--change <id>', 'Change name')
  .option('--base <ref>', 'Base ref the PR branched from (default: catch.baseRef from qaspec/config.yaml)')
  .option('--without-analysis', 'Degraded mode: diff only, no approval or intent; the run is marked low confidence')
  .option('--head <sha>', 'PR head commit to catch (with --without-analysis only)')
  .option('--json', 'Output as JSON')
  .action(
    async (options: { change: string; base?: string; withoutAnalysis?: boolean; head?: string; json?: boolean }) => {
      try {
        await catchStartCommand(options);
      } catch (error) {
        console.log();
        ora().fail(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    }
  );

catchCmd
  .command('status')
  .description('Show one catch run (--run; --change narrows the search) or list the runs of a change (--change)')
  .option('--run <id>', 'Run id printed by catch start')
  .option('--change <id>', 'Change name: lists its runs, or limits the --run lookup to it')
  .option('--json', 'Output as JSON')
  .action(async (options: { run?: string; change?: string; json?: boolean }) => {
    try {
      await catchStatusCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('finish')
  .description('Close a catch run: removes its worktree and keeps the run folder (a second call changes nothing)')
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await catchFinishCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('context')
  .description(
    'Print what the agent needs to write risks, mutants and tests for a ready run: the intent, the changed files (project-relative), the diff, and the existing tests related to the changes (computed once on the parent and cached in the run)'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await catchContextCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('risk')
  .description(
    'Record a risk of the change from a JSON file (--input): { "requirement", "scenario"?, "summary" } names a preserved, modified or added requirement of the intent; in a degraded run { "file", "summary" } names a changed file'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .requiredOption('--input <file>', 'JSON file with the risk (the text is read from the file, never from the command line)')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; input: string; json?: boolean }) => {
    try {
      await catchRiskCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('mutant')
  .description(
    'Record a mutant from a JSON file (--input): { "risk", "file", "original", "replacement" } replaces the exact original text once in a file of the parent and runs the gates (equivalence by comments, then the related existing tests); the file is restored afterwards'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .requiredOption('--input <file>', 'JSON file with the mutant (the text is read from the file, never from the command line)')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; input: string; json?: boolean }) => {
    try {
      await catchMutantCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('equivalence')
  .description(
    'Record the fresh-context verdict on a surviving mutant from a JSON file (--input): { "equivalent": true | false, "rationale" }; equivalent discards the mutant, once'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .requiredOption('--mutant <id>', 'Mutant id printed by catch mutant, such as M1')
  .requiredOption('--input <file>', 'JSON file with the verdict (the text is read from the file, never from the command line)')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; mutant: string; input: string; json?: boolean }) => {
    try {
      await catchEquivalenceCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('test')
  .description(
    'Record a test from a JSON file (--input): { "kind": "catching", "mutant", "path", "content" } must pass on the parent in every run and fail on the mutated parent; { "kind": "functionality", "requirement", "scenario"? } and { "kind": "dodgy-diff" } record the parent outcome once. The content is stored in the run folder and written into the worktree only while a run uses it'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .requiredOption('--input <file>', 'JSON file with the test (the content is read from the file, never from the command line)')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; input: string; json?: boolean }) => {
    try {
      await catchTestCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('child')
  .description(
    'Run every gated test on the PR head (catch.setup runs again only when a configured path changed) and classify each one as land, report, signal or discard (S5 Table 3); the run ends classified and the worktree stays at the head'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await catchChildCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('assess')
  .description(
    'Assess the reports of a classified run, once: the generic and per-project rules (catch.rulesFile) discard false positives, and the reports that survive get their intent signals (the run moves to assessed)'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await catchAssessCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('judge')
  .description(
    'Record the verdicts of the judges on one kept report from a JSON file (--input): { "verdicts": [{ "judge", "keep", "confidence": "high" | "medium" | "low", "rationale" }] } with exactly catch.judges verdicts; a judge can only discard, and a median below 0 discards the report (once per report)'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .requiredOption('--test <id>', 'Report to judge, such as T1 (printed by catch assess)')
  .requiredOption('--input <file>', 'JSON file with the verdicts (the text is read from the file, never from the command line)')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; test: string; input: string; json?: boolean }) => {
    try {
      await catchJudgeCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('report')
  .description(
    'Record the finding of one kept report from a JSON file (--input): { "before", "after" } written from the failure evidence; the CLI composes the question and writes findings.json and findings.md (once per report)'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .requiredOption('--test <id>', 'Report to record, such as T1 (a report the judges kept)')
  .requiredOption('--input <file>', 'JSON file with before and after (the text is read from the file, never from the command line)')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; test: string; input: string; json?: boolean }) => {
    try {
      await catchReportCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('answer')
  .description(
    'Record the answer to a finding: --intended yes dismisses it, --intended no confirms it (once); the optional note comes from --note-file'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .requiredOption('--finding <id>', 'Finding id such as F1')
  .requiredOption('--intended <yes|no>', 'Whether the behavior is intended')
  .option('--note-file <file>', 'Optional note from the person, read from a plain text file')
  .option('--json', 'Output as JSON')
  .action(
    async (options: { run: string; finding: string; intended: string; noteFile?: string; json?: boolean }) => {
      try {
        await catchAnswerCommand(options);
      } catch (error) {
        console.log();
        ora().fail(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    }
  );

catchCmd
  .command('land')
  .description(
    'Prepare the landing of a classified run: copies each test classified land under the run folder (land/) and writes one patch that adds them to the PR head, with repository-relative paths; a test whose path exists on the head is refused and listed. Apply the patch from the repository root with git apply --check, then run catch landed'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await catchLandCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

catchCmd
  .command('landed')
  .description(
    'Record the landing of a run once, after the patch was applied in the checkout: one landed ledger line per prepared test (refused when land was not run, when it prepared no test, when the run is finished, or when it is already recorded)'
  )
  .requiredOption('--run <id>', 'Run id printed by catch start')
  .option('--json', 'Output as JSON')
  .action(async (options: { run: string; json?: boolean }) => {
    try {
      await catchLandedCommand(options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Approve command — record phase approval in the change ledger
const approveCmd = program
  .command('approve')
  .description('Record user approval of a workflow phase');

approveCmd
  .command('analyze')
  .description('Record approval of analyze-phase artifacts (analysis.md + delta specs)')
  .requiredOption('--change <id>', 'Change name')
  .option('--head-sha <sha>', 'PR head commit SHA at approval time')
  .option('--json', 'Output as JSON')
  .action(async (options: { change: string; headSha?: string; json?: boolean }) => {
    try {
      await approveCommand('analyze', options);
    } catch (error) {
      console.log();
      ora().fail(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
