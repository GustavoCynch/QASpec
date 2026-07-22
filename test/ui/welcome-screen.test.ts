import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showWelcomeScreen } from '../../src/ui/welcome-screen.js';
import { getQaSpecWordmarkLines, QA_SPEC_LABEL } from '../../src/ui/ascii-patterns.js';

function setTty(isTty: boolean): void {
  Object.defineProperty(process.stdout, 'isTTY', { value: isTty, configurable: true });
  Object.defineProperty(process.stdin, 'isTTY', { value: isTty, configurable: true });
}

describe('showWelcomeScreen', () => {
  beforeEach(() => {
    vi.spyOn(global, 'setInterval');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not use setInterval animation', async () => {
    setTty(false);
    await showWelcomeScreen();
    expect(setInterval).not.toHaveBeenCalled();
  });

  it('prints welcome title exactly once', async () => {
    setTty(false);
    await showWelcomeScreen();

    const output = vi.mocked(console.log).mock.calls.flat().join('\n');
    const matches = output.match(/Welcome to QASpec/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('prints boxed QA · Spec wordmark', async () => {
    setTty(false);
    await showWelcomeScreen();

    const output = vi.mocked(console.log).mock.calls.flat().join('\n');

    for (const line of getQaSpecWordmarkLines()) {
      expect(output).toContain(line);
    }

    expect(output).toContain(QA_SPEC_LABEL);
    expect(output).not.toMatch(/[█#]{3}.*[█#]{3}/);
    expect(output).not.toContain('  QA                    Spec');
  });

  it('prints QASpec tagline', async () => {
    setTty(false);
    await showWelcomeScreen();

    const output = vi.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('Agree on what to test before you run');
    expect(output).toContain('specs live in the repo');
    expect(output).not.toContain('lightweight spec-driven framework');
  });

  it('uses provider-neutral publish copy in the quick-start line', async () => {
    setTty(false);
    await showWelcomeScreen();

    const output = vi.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).not.toContain('Publish to Qase');
    expect(output).toMatch(/Publish to your TCMS/i);
  });

  it('does not write terminal redraw escape sequences to stdout', async () => {
    setTty(false);
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    });

    await showWelcomeScreen();

    const combined = stdoutWrites.join('');
    expect(combined).not.toMatch(/\x1b\[[0-9]*A/);
    expect(combined).not.toContain('\x1b[?1049');
    expect(combined).not.toContain('\x1b[2K');
  });
});
