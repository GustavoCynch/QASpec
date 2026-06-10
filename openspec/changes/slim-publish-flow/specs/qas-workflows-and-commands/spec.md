# qas-workflows-and-commands Delta

## MODIFIED Requirements

### Requirement: Publish workflow behavior

The `qaspec-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, read completed `specs/**/*.md` for context before MCP when files exist, resolve the TCMS target (provider, project code, base URL) from the `tcms` block in `qaspec/config.yaml`, present an in-chat publish summary derived from unchecked cases in `testcases.md` (or legacy `testmatrix.md` when only that file exists), halt once for the user to confirm or adjust scope, and only after explicit confirmation validate the case list, call Qase via MCP, write `publish-log.md`, and mark published rows in the tracked cases file. The prepare step SHALL NOT write `publish-plan.md` or `execution-context.md`.

#### Scenario: Target resolved from project config

- **GIVEN** `qaspec/config.yaml` contains a `tcms` block with provider, project code, and base URL
- **WHEN** the user runs `/qsx:publish`
- **THEN** the agent uses that target without asking prerequisite questions
- **AND** proceeds directly to the publish summary and single confirm halt

#### Scenario: Publish blocked without specs

- **WHEN** `testcases.md` exists but no files exist under the change `specs/` directory and the schema apply phase requires `specs`
- **THEN** the agent does not invoke Qase MCP
- **AND** the agent directs the user to complete `/qsx:cases` (or author deltas) before publish

#### Scenario: In-chat summary before confirm

- **WHEN** the TCMS target is known and the case list is approved
- **THEN** the agent presents in chat: the target (provider, project, base URL), each suite with its unchecked-case count, and warnings (cases without **Steps** blocks, suspected PII)
- **AND** the summary is derived from `testcases.md` at that moment, with no plan file written
- **AND** the agent asks exactly one confirmation question and does not call Qase MCP in the same message

#### Scenario: MCP only after confirmation

- **WHEN** the user confirms publish after the summary halt
- **THEN** the agent re-reads `testcases.md` and maps case **Preconditions** and **Steps** to Qase fields per `qase_test_case_rules.md` without replacing steps with newly invented steps based only on titles
- **AND** the agent invokes Qase MCP, writes `publish-log.md`, and marks each published row `- [x]` in `testcases.md`

#### Scenario: Scope edits after the halt

- **WHEN** the user requests scope or case changes after the summary halt
- **THEN** the agent updates `testcases.md` (the single source of truth) or records agreed exclusions, re-presents the summary, and asks again for confirm before MCP

#### Scenario: Publish from legacy in-flight change

- **GIVEN** a change created before the rename contains `testmatrix.md` and no `testcases.md`
- **WHEN** the user runs `/qsx:publish`
- **THEN** publish reads and tracks `testmatrix.md` as the case source
- **AND** a notice suggests renaming the file to `testcases.md`

## ADDED Requirements

### Requirement: TCMS target discovery and persistence

When `qaspec/config.yaml` has no usable `tcms` target, the publish workflow SHALL discover available Qase projects via MCP when a listing tool exists, offer the user existing projects or creating a new project in one halt, create the project via MCP when the user chooses that and a creation tool exists (otherwise instruct the user to create it in the Qase UI and provide the code), persist the chosen target to the `tcms` block in `qaspec/config.yaml` announcing the edit, and SHALL NOT upload cases in the same message as target selection or creation.

#### Scenario: First publish in a project without tcms config

- **GIVEN** `qaspec/config.yaml` has no `tcms` block
- **WHEN** the user runs `/qsx:publish` with Qase MCP available
- **THEN** the agent lists existing Qase projects and offers creating a new one in a single halt
- **AND** after the user picks, the agent writes the `tcms` block to `qaspec/config.yaml` and says so
- **AND** the publish summary and confirm halt follow in a later message, never alongside the upload

#### Scenario: User chooses to create a new project

- **WHEN** the user selects "create new project" and the Qase MCP exposes a project-creation tool
- **THEN** the agent creates the project via MCP with a name and code the user approved
- **AND** persists the new project code to the `tcms` block

#### Scenario: Discovery degrades without optional MCP tools

- **WHEN** the Qase MCP lacks project listing or creation tools
- **THEN** the agent asks for the project code in the same single halt instead of failing
- **AND** persists the provided value to the `tcms` block

#### Scenario: Legacy execution-context migrates to config

- **GIVEN** config has no `tcms` block and the change contains a legacy `execution-context.md` with project code and base URL
- **WHEN** the user runs `/qsx:publish`
- **THEN** the agent uses those values, offers persisting them to `qaspec/config.yaml`, and does not re-ask for them
- **AND** legacy `publish-plan.md` files are ignored and never required
