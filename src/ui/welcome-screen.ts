/**
 * Welcome screen for `qaspec init`.
 * Plain line-based output only (no cursor animation or alternate-screen escapes).
 */

import chalk from 'chalk';
import { getQaSpecWordmarkLines } from './ascii-patterns.js';

function printWelcomeContent(): void {
  console.log();
  console.log(chalk.white.bold('Welcome to QASpec'));
  console.log(chalk.dim('Agree on what to test before you run — specs live in the repo.'));
  console.log();
  for (const line of getQaSpecWordmarkLines()) {
    console.log(chalk.cyan(line));
  }
  console.log();
  console.log(chalk.white('This setup will configure:'));
  console.log(chalk.dim('  • QA workflow skills for your AI assistant'));
  console.log(chalk.dim('  • /qas:* slash commands'));
  console.log(chalk.dim('  • qaspec/references/ project seeds'));
  console.log();
  console.log(chalk.white('Quick start after setup:'));
  console.log(`  ${chalk.yellow('/qas:explore')}   ${chalk.dim('Think before the formal cycle')}`);
  console.log(`  ${chalk.yellow('/qas:analyze')}   ${chalk.dim('Analysis artifact')}`);
  console.log(`  ${chalk.yellow('/qas:matrix')}    ${chalk.dim('Test matrix')}`);
  console.log(`  ${chalk.yellow('/qas:publish')}   ${chalk.dim('Publish to Qase')}`);
  console.log();
  console.log(chalk.cyan('Press Enter to select tools...'));
}

function canWaitForEnter(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const { stdin } = process;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    const onData = (data: Buffer): void => {
      const char = data.toString();
      if (char === '\r' || char === '\n' || char === '\u0003') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(wasRaw);
        stdin.pause();

        if (char === '\u0003') {
          console.log();
          process.exit(0);
        }

        resolve();
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Shows the welcome screen. Returns when user presses Enter (interactive TTY only).
 */
export async function showWelcomeScreen(): Promise<void> {
  printWelcomeContent();

  if (canWaitForEnter()) {
    await waitForEnter();
    console.log();
  }
}
