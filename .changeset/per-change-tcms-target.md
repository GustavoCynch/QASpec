---
'@qaspec/cli': minor
---

Move the TCMS publish target from project config to per-change metadata and default publish to proposing a new TCMS project.

- New `qaspec tcms set/show --change <name>` commands persist and resolve the target (provider, project, baseUrl) in the change's `.qaspec.yaml`; the `tcms` block in `qaspec/config.yaml` is now optional user-managed defaults that no workflow or command writes.
- `qaspec publish-gate` validates the per-change target (merged over config defaults) and prints the resolved target with the gate token.
- The publish workflow now defaults to proposing the creation of a new TCMS project (existing projects are offered only as alternatives) and must halt for the user's explicit choice before persisting anything — it never selects an existing project on its own.
