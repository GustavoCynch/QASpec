import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';

const QAS_CATCH_BODY = `Run QASpec **catch**. Generate catching and hardening tests for one pull request from its approved change intent, let the \`qaspec catch\` CLI run every gate and classify every result, and ask the person one cheap question for each likely regression. You write the risks, mutants, tests, verdicts and findings as files; you never decide a gate outcome yourself.

## Config and trust

Read the \`catch\` block of \`qaspec/config.yaml\` (\`baseRef\`, \`setup\`, \`runner\`, \`env\`, \`gates\`, \`judges\`, \`rulesFile\`) before the run. The project's values live there and in \`qaspec/references/\`; this workflow carries none of them.

**Trust, said once.** Before the first run, tell the person once: the mutants and the tests you write are code written by the agent, and the project's test runner runs them with the developer's permissions. The run uses a git worktree outside the project, an environment allowlist and timeouts, but there is no network or filesystem sandbox.

## Preconditions

1. **Approved change.** By default the change needs an approved analysis with an \`Intent class\` section and a \`headSha\` in its approval. \`qaspec catch start\` checks both, the delta specs and the \`catch\` block, and reports every blocker with its \`resolve\` text. Relay each blocker and stop when the run is refused.
2. **Degraded mode.** Use \`qaspec catch start --change "<name>" --without-analysis --head "<sha>" --json\` only when the person asks for it, with the PR head commit the person gives you. It has no intent. Every finding of a degraded run is low confidence, and you say so with each finding.
3. **Judges.** The equivalence verdicts and the assessor judges are fresh-context subagents: a context that did not write the mutant or the test it judges. Before the run starts, check that your agent tool can launch a subagent. If your agent tool cannot launch a subagent, stop with a clear message; never judge in the context that wrote the code.
4. **Runner and setup.** \`catch.runner\` needs \`adapter\` and \`command\`, and the base comes from \`--base\` or \`catch.baseRef\`. Every \`catch.setup\` command must be idempotent, because it runs again on every switch when \`setup.reinstallWhenChanged\` lists no path.
5. **Intent check.** \`qaspec catch intent --change "<name>" --json\` prints the intent class and the requirements without writing anything. Use it to check the intent before \`start\` when you need to.

## Steps

1. **Start.** Run \`qaspec catch start --change "<name>" --json\`, or the degraded command of precondition 2, and read the JSON even when the exit code is 1. Add \`--base "<ref>"\` when the person names the base. \`started: false\`: report each entry of \`blockers\` with its \`resolve\` text, and stop. \`started: true\` with \`state: "ready"\`: keep \`run\` (the run id) and \`runDir\`. Any other \`state\` means the run did not start: report \`failure\`; for \`setup-failed\`, point the person to \`setup-output.json\` in the run folder, whose output is never printed in full. Then run \`finish\` and stop.
2. **Context.** Run \`qaspec catch context --run "<id>" --json\`. Read \`intent\` (its \`intentClass\`, and each requirement with its \`status\`, one of \`preserved\`, \`modified\`, \`added\`, \`removed\` or \`renamed\`, and its scenarios), \`changedFiles\` (project-relative), \`diff\` and \`relatedTests\` (the existing test files that relate to the changes; the mutant gates run them). In a degraded run \`intent.intentClass\` is \`null\`.
3. **Risks.** Write each risk as a JSON file with your file-writing tool, then run \`qaspec catch risk --run "<id>" --input "<runDir>/drafts/<risk>.json" --json\`. Start from the \`preserved\` requirements of the affected capabilities, then the \`modified\` and \`added\` ones; \`removed\` and \`renamed\` requirements take no risk. An analysis risk names its requirement: \`{"requirement": "<name>", "scenario": "<title>", "summary": "<text>"}\`, with the scenario optional. A degraded risk names a changed file: \`{"file": "<project-relative path>", "summary": "<text>"}\`. The CLI returns the risk id (\`R1\`, \`R2\`, ...). Record at most 5 risks, unless the person asks for more.
4. **Mutants.** For each risk, write at most 2 mutants of the parent code as JSON: \`{"risk": "R1", "file": "<project-relative file>", "original": "<text that occurs exactly once in that file of the parent>", "replacement": "<text>"}\`. Then run \`qaspec catch mutant --run "<id>" --input "<runDir>/drafts/<mutant>.json" --json\` and read its \`outcome\`:
   - \`syntactic-equivalent\`, \`no-build\` and \`caught-by-existing\` are discarded. A \`caught-by-existing\` mutant lists in \`caughtBy\` the existing test files that caught it.
   - \`baseline-not-passing\` means the related tests did not pass on the unmutated parent, so the mutant is discarded and not blamed on the change. Tell the person about that baseline.
   - \`inconclusive\` (a timeout, a runner error or a failed lookup) is never a finding.
   - \`surviving\` needs one equivalence verdict from one fresh-context judge, which reads the parent file and the mutant and answers \`{"equivalent": true, "rationale": "<text>"}\` or \`{"equivalent": false, "rationale": "<text>"}\`. Record it once with \`qaspec catch equivalence --run "<id>" --mutant "<M1>" --input "<verdict file>" --json\`. \`judged-equivalent\` is discarded; \`non-equivalent\` goes on to the tests.
5. **Tests.** For each \`non-equivalent\` mutant, write one catching test in the project's test style, next to the code it tests, that passes on the parent and fails on the mutant. For each \`added\` or \`modified\` scenario, write one functionality test, unless the person asks for more. In a degraded run, write dodgy-diff tests of the changed behavior instead. Each test is a JSON file with a new project-relative \`path\` (it must not exist on the parent) and its \`content\`:
   - catching: \`{"kind": "catching", "mutant": "M1", "path": "<path>", "content": "<test text>"}\`
   - functionality: \`{"kind": "functionality", "requirement": "<name>", "scenario": "<title>", "path": "<path>", "content": "<test text>"}\`
   - dodgy-diff: \`{"kind": "dodgy-diff", "path": "<path>", "content": "<test text>"}\`

   Record each one with \`qaspec catch test --run "<id>" --input "<runDir>/drafts/<test>.json" --json\`. \`gated\` means the test goes on to the head. \`parent-not-passing\`, \`flaky-parent\`, \`not-caught-by-test\` and \`inconclusive\` end it, and none of them is a finding.
6. **Child.** Run \`qaspec catch child --run "<id>" --json\`. It moves the worktree to the PR head once and runs every gated test there. With \`status: "classified"\`, read each result's \`action\`: \`land\` (it passes on the head: offer it for landing), \`report\` (it fails on the head and the parent did not fail it: a likely regression, asked as a finding), \`signal\` (the head does not build), or \`discard\` (it fails on both). The run ends \`classified\`. With \`status: "setup-failed"\` the run ends \`child-setup-failed\`: report it, point the person to \`setup-output.json\`, and finish the run. With \`status: "refused"\`, its \`errors\` say why the child phase did not run. \`child\` runs only from \`ready\`: a run that ends \`child-running\` or \`child-failed\` cannot continue, so report that state and finish the run.
7. **Assess.** Run \`qaspec catch assess --run "<id>" --json\` once. The generic rules and the project rules of \`catch.rulesFile\` discard false positives as \`rule-filtered\`, with the rule id. Each \`kept\` report carries its \`signals\`: \`unexpected-for-intent\` (it names a preserved requirement, or the intent class is \`refactor\`), \`possibly-intended\` (it names a modified requirement), and \`low-confidence\` (a degraded run). The run moves to \`assessed\`.
8. **Judges.** For each \`kept\` report, launch \`catch.judges\` fresh-context judges, one subagent each, in parallel where your agent tool allows. Each judge reads the report's test, the failure evidence and the intent, and answers \`{"verdicts": [{"judge": "<name>", "keep": true, "confidence": "high", "rationale": "<text>"}]}\` with exactly the number of verdicts that \`catch.judges\` sets. \`keep\` is \`true\` or \`false\`, and \`confidence\` is \`high\`, \`medium\` or \`low\`. Judges can only discard: a \`keep: false\` verdict is a vote to discard, and no verdict can add or promote a report. Record the verdicts once per report with \`qaspec catch judge --run "<id>" --test "<T1>" --input "<verdict file>" --json\`. \`judge-filtered\` drops the report; \`kept\` goes on to the next step.
9. **Findings.** For each report the judges kept, write its \`before\` and \`after\` as plain text from the failure evidence: what the parent did, and what the head does now. Record them with \`qaspec catch report --run "<id>" --test "<T1>" --input "<file>" --json\`, where the file holds \`{"before": "<text>", "after": "<text>"}\`. The CLI composes the question and returns the finding id (\`F1\`, \`F2\`, ...) with its \`question\`.
10. **Questions.** Present each finding as its \`question\`, one at a time and exactly as the CLI composed it: the before and the now, what the scenario says, and whether it is intended. Wait for the person's answer to each finding, then record it once with \`qaspec catch answer --run "<id>" --finding "<F1>" --intended yes|no --json\`: \`yes\` means the behavior is intended and dismisses the finding, \`no\` means it is not and confirms it. When the person gives a note, write it with your file-writing tool to \`<runDir>/drafts/<finding>-note.txt\` and add \`--note-file "<runDir>/drafts/<finding>-note.txt"\` to the same command.
11. **Landing.** Run \`qaspec catch land --run "<id>" --json\`. It copies each test classified \`land\` into the run folder and writes one patch, named in \`patch\`, that adds them against the PR head (\`headSha\`), with repository-relative paths. \`patch\` is null when nothing lands, and \`refused\` lists the tests that cannot land, such as a path that already exists on the head. With nothing to land, go to step 12. Otherwise ask the person once whether to apply the patch to their checkout, citing each test's \`path\` and the patch. On yes, from the repository root (\`git rev-parse --show-toplevel\`): check that \`git rev-parse HEAD\` equals \`headSha\`, run \`git apply --check "<patch>"\`, then \`git apply "<patch>"\`, then run \`qaspec catch landed --run "<id>" --json\`. Run every git command from the repository root, because a \`git apply\` from a subfolder silently skips paths. If the checkout is not at the PR head or the check fails, apply nothing and report it. Never stage, commit or push: the person reviews and commits.
12. **Finish.** Run \`qaspec catch finish --run "<id>" --json\`. Run \`finish\` always, also after an error or a refusal once the run exists: it removes the worktree and keeps the run folder. Then run \`qaspec catch status --run "<id>" --json\` and summarize the run: its \`state\`, the funnel (risks, mutants and tests by outcome, classified, assessed, judged and reported findings), the \`precision\` (confirmed over confirmed plus dismissed), and every mutant or test you could not decide. A finished run takes no more records.

**Guardrails:** the CLI decides every gate outcome, and you never do. A refused record (\`recorded: false\`, exit code 1) is not stored: correct the file from its \`errors\` and submit it again. Never put application code, a diff, test content, a finding text or a note on a command line: write it to a file under the run folder with your file-writing tool, and pass the file with \`--input\` or \`--note-file\`. Write only inside the run folder \`qaspec/changes/<name>/catch/<run-id>/\`, plus the one confirmed landing patch in the user's checkout. Never edit the application's source code in the user's checkout: mutants live only in the worktree, which \`finish\` removes. Never run the \`catch.setup\` commands yourself, and never open or print credential files, tokens, environment values or \`.env\` files. Stop and report instead of working around a refusal.`;

export function getQasCatchSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-catch',
    description:
      'QASpec catch — generate catching and hardening tests for a PR from its approved change intent, and ask about each likely regression',
    instructions: QAS_CATCH_BODY,
    compatibility:
      'Requires qaspec CLI, a Jest and TypeScript test runner configured in qaspec/config.yaml, and a subagent-capable agent tool for the judges.',
    metadata: { author: 'qaspec', version: '1.0' },
  };
}

export function getQasCatchCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Catch',
    description:
      'Generate catching and hardening tests for a PR from its approved change intent, and ask about each likely regression',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'catch', 'qa'],
    content: QAS_CATCH_BODY,
  };
}
