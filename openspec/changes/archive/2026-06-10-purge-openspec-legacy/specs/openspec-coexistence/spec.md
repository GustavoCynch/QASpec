## REMOVED Requirements

### Requirement: Detect active upstream OpenSpec
**Reason**: QASpec no longer supports coexisting with an upstream OpenSpec installation in the same project; no users rely on this.
**Migration**: None. Projects using both tools manage their own assistant skills/commands; QASpec only manages the artifacts it generates.

### Requirement: Do not modify upstream OpenSpec when active
**Reason**: Coexistence capability retired with upstream detection.
**Migration**: None.

### Requirement: Coexistence summary when skipping upstream writes
**Reason**: Coexistence capability retired; there are no skipped upstream writes to summarize.
**Migration**: None.

### Requirement: Coexistence prose clarity
**Reason**: Coexistence capability retired; generated prose no longer mentions upstream OpenSpec.
**Migration**: None.
