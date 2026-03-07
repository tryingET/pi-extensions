---
summary: "Automatic failure recovery compaction triggered on repeated tool failures."
read_when:
  - "Understanding failure-burst recovery."
  - "Debugging automatic compaction triggers."
system4d:
  container: "Detailed documentation for failure recovery and watchdog."
  compass: "Explain failure detection thresholds and watchdog timeout."
  engine: "State diagrams + sequence diagrams + thresholds."
  fog: "Thresholds may need tuning per workload."
---
# Failure Recovery Compaction

Part of [[custom-compaction-architecture|Custom Compaction Architecture]].

When tools fail repeatedly, the extension automatically triggers a **recovery compaction** with focused instructions.

---

## Failure Detection State Machine

```mermaid
stateDiagram-v2
    [*] --> Success: Tool Result OK
    [*] --> Failure: Tool Result Error

    Success --> Reset: Reset consecutive = 0

    Failure --> CheckBurst: Increment counters

    CheckBurst --> CheckCooldown: Turn burst OR<br/>consecutive burst?

    CheckBurst --> [*]: No burst yet

    CheckCooldown --> TriggerRecovery: Cooldown expired?
    CheckCooldown --> [*]: Still cooling down

    TriggerRecovery --> PlaceCheckpoint: Place risk checkpoint

    PlaceCheckpoint --> RunCompaction: compactWithWatchdog()

    RunCompaction --> Notify: Notify user

    Notify --> [*]: Recovery complete
```

---

## Detection Thresholds

| Threshold | Value | Purpose |
|-----------|-------|---------|
| `FAILURE_BURST_IN_TURN_THRESHOLD` | 3 | Failures in single turn to trigger |
| `FAILURE_CONSECUTIVE_THRESHOLD` | 4 | Consecutive failures to trigger |
| `FAILURE_BURST_WINDOW_MS` | 180,000 (3 min) | Window for consecutive count |
| `FAILURE_RECOVERY_COOLDOWN_MS` | 120,000 (2 min) | Cooldown between recoveries |

```mermaid
graph LR
    subgraph "Turn Burst Detection"
        T1[failedToolCallsThisTurn >= 3]
    end

    subgraph "Consecutive Burst Detection"
        C1[consecutiveToolFailures >= 4]
        C2[Within 3-minute window]
    end

    subgraph "Recovery Guardrails"
        R1[Cooldown: 2 minutes<br/>between recoveries]
        R2[Watchdog timeout: 2 minutes<br/>for compaction]
    end

    T1 --> Trigger[Trigger Recovery]
    C1 --> Trigger
    C2 --> Trigger

    Trigger --> R1
    Trigger --> R2
```

---

## Recovery Sequence

```mermaid
sequenceDiagram
    participant tool as Tool Execution
    participant ext as Extension
    participant pi as pi Core

    tool->>ext: tool_result (error)

    ext->>ext: Check burst conditions

    alt Burst Detected & Recovery Enabled
        ext->>ext: Check cooldown
        alt Cooldown Expired
            ext->>ext: Place risk checkpoint
            ext->>ext: Build compaction instructions

            ext->>pi: compactWithWatchdog()

            Note over pi: 2-minute watchdog timeout

            pi->>pi: Run compaction with focus:<br/>"Focus on repeated tool failures,<br/>summarize failing commands/paths,<br/>likely causes, safe next step,<br/>avoid retry loops."

            alt Success
                pi-->>ext: onComplete
                ext->>pi: Notify: "Failure-recovery compaction completed"
            else Timeout
                pi->>pi: Abort compaction
                pi-->>ext: Notify: "timed out and was aborted"
            else Error
                pi-->>ext: onError
                ext->>pi: Notify error
            end

            ext->>pi: Notify: "Failure burst detected"
        else Still Cooling Down
            ext->>ext: Skip recovery
        end
    end
```

---

## Watchdog Timeout Mechanism

The `compactWithWatchdog` function ensures compaction operations don't hang indefinitely.

```mermaid
flowchart TD
    Start[compactWithWatchdog Called] --> SetTimeout[Set 2-minute timeout]

    SetTimeout --> Unref[unref timeout<br/>Don't block process exit]

    Unref --> StartCompaction[Call ctx.compact]

    StartCompaction --> Wait{Wait for settle}

    Wait -->|onComplete| Success[Success path]
    Wait -->|onError| Error[Error path]
    Wait -->|Timeout| Abort{isIdle?}

    Abort -->|Not Idle| DoAbort[Call ctx.abort]
    Abort -->|Idle| SkipAbort[Skip abort]

    DoAbort --> NotifyTimeout[Notify: timed out warning]
    SkipAbort --> NotifyTimeout

    Success --> Settle[settled = true<br/>clear timeout]
    Error --> Settle

    Settle --> Return[Return]

    NotifyTimeout --> Return

    style Wait fill:#2196f3,color:#fff
    style Abort fill:#ff9800,color:#000
    style Settle fill:#4caf50,color:#fff
```

---

## Recovery Instructions

Recovery compaction uses focused instructions:

```
Focus on repeated tool failures: summarize failing commands/paths,
likely causes, safe next step, and avoid retry loops.
```

This is combined with the base [[compaction-helpers|AUTONOMY_COMPACTION_FOCUS]].
