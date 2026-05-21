# Qase test case rules (MCP)

Rules for creating suites and cases in Qase via MCP (`create_suite`, `create_case`).
Read before `/qas:matrix` and again before `/qas:publish`.

## Suites

- One suite per logical module or feature (`## Suite:` group in `testmatrix.md`).
- Suite titles use plain language visible to testers.

## Cases

- Titles and steps: tester-observable behavior in the **project language** (see `qaspec/config.yaml`).
- No code identifiers (camelCase fields, selectors, file paths) in Qase-bound text unless shown in the UI.
- One checkbox in `testmatrix.md` maps to one Qase case after publish.

## Preconditions template

1. Environment access (name your staging/dev environment).
2. Role and tenant (e.g. logged in as [ROLE] in [ORG]).
3. Case-specific data setup.

## Customize

Replace this file with your team's Qase field codes, severity/priority mapping, and step format rules.
