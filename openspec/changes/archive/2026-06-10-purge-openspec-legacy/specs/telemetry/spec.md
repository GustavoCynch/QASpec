## REMOVED Requirements

### Requirement: Command execution tracking
**Reason**: QASpec collects no usage telemetry; the module shipped events to the upstream vendor's endpoint (`edge.openspec.dev`), which is unacceptable for an independent product.
**Migration**: None. No replacement backend; the capability is retired.

### Requirement: Privacy-preserving event design
**Reason**: Telemetry capability retired.
**Migration**: None.

### Requirement: Environment variable opt-out
**Reason**: Telemetry capability retired; `OPENSPEC_TELEMETRY` and `DO_NOT_TRACK` handling are removed with it.
**Migration**: Users can unset `OPENSPEC_TELEMETRY`; it has no effect in any release containing this change.

### Requirement: CI environment auto-disable
**Reason**: Telemetry capability retired.
**Migration**: None.

### Requirement: First-run telemetry notice
**Reason**: Telemetry capability retired; there is nothing to notify about.
**Migration**: None.

### Requirement: Anonymous user identification
**Reason**: Telemetry capability retired; no anonymous ID is generated or stored.
**Migration**: Users may delete any existing `~/.config/openspec/` directory; QASpec no longer reads it.

### Requirement: Immediate event sending
**Reason**: Telemetry capability retired.
**Migration**: None.

### Requirement: Graceful shutdown
**Reason**: Telemetry capability retired.
**Migration**: None.

### Requirement: Silent failure handling
**Reason**: Telemetry capability retired.
**Migration**: None.
