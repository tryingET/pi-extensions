---
summary: "Architecture overview of custom compaction system in pi-autonomous-session-control."
read_when:
  - "Understanding the compaction system at a high level."
  - "Finding specific compaction documentation."
system4d:
  container: "Index document for custom compaction architecture."
  compass: "Provide overview and navigation to detailed sub-documents."
  engine: "Overview diagrams + links to detailed docs."
  fog: "Sub-docs may drift from this index; update links when splitting further."
---
# Custom Compaction Architecture

This document explains how the custom compaction system works in `pi-autonomous-session-control`.

---

## Overview: Why Custom Compaction?

The extension provides **three compaction mechanisms**:

1. **Compaction Guard (Loop-Risk Interception)** - Intercepts risky compactions before they happen
2. **Failure-Burst Recovery Compaction** - Triggered automatically on repeated tool failures
3. **Manual Compaction via Tool** - On-demand compaction with custom instructions

```mermaid
graph TB
    subgraph "Compaction Triggers"
        A[pi Core: Context Window Full]
        B[Tool Failures Detected]
        C[Tool Call: compact action]
    end

    subgraph "Extension Compaction Handlers"
        D[session_before_compact<br/>Loop-Risk Guard]
        E[tool_result Event<br/>Failure Recovery]
        F[autonomous_session_control<br/>Manual Compact]
    end

    subgraph "Compaction Execution"
        G[compactWithWatchdog]
        H[pi.runCompaction]
    end

    A --> D
    B --> E
    C --> F

    D -->|Loop Risk Detected| H
    D -->|No Risk| I[Use Default Compaction]
    E --> G
    F --> G
    G --> H
```

---

## Detailed Documentation

For implementation details, see:

- [[compaction-guard|Compaction Guard]] - Loop-risk interception logic
- [[failure-recovery-compaction|Failure Recovery]] - Automatic recovery on tool failures
- [[compaction-helpers|Compaction Helpers]] - Instructions merging and API discovery
- [[compaction-configuration|Configuration]] - Required settings and thresholds

---

## Summary: Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Loop-Risk Guard | `autonomy-control.ts` | Intercepts risky compactions in `session_before_compact` |
| Failure Recovery | `autonomy-control.ts` | Auto-triggers compaction on tool failure bursts |
| Watchdog | `compact-with-watchdog.ts` | 2-minute timeout for compaction operations |
| Resolver | `resolve-prepare-compaction.ts` | Discovers `prepareCompaction` from pi API |
| Helpers | `helpers.ts` | Token calculations and instruction building |
| Constants | `constants.ts` | Thresholds, ratios, and timeout values |

```mermaid
mindmap
  root((Custom Compaction))
    Triggers
      Loop-Risk Guard
        session_before_compact
        85% threshold
      Failure Recovery
        3 failures in turn
        4 consecutive failures
      Manual Tool
        compact action
        customInstructions
    Guardrails
      Watchdog Timeout
        2 minutes
        Auto-abort
      Cooldown
        2 minutes between recoveries
      Token Clamping
        12k minimum
        96k maximum
    Configuration
      reserveTokens ~16k
      keepRecentTokens ~24k
      compaction.enabled true
```
