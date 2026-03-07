---
summary: "Compaction guard logic for preventing compaction thrashing."
read_when:
  - "Understanding loop-risk interception."
  - "Debugging compaction guard behavior."
system4d:
  container: "Detailed documentation for compaction guard."
  compass: "Explain the loop-risk detection and adjustment logic."
  engine: "Flowcharts + sequence diagrams + constants."
  fog: "Constants may need tuning per model/provider."
---
# Compaction Guard: Loop-Risk Interception

Part of [[custom-compaction-architecture|Custom Compaction Architecture]].

The guard prevents **compaction thrashing** - when context keeps triggering compaction because `keepRecentTokens` is too large relative to the trigger threshold.

---

## Flow Diagram

```mermaid
flowchart TD
    Start[session_before_compact Event] --> Calc{Calculate<br/>triggerTokens}

    Calc -->|contextWindow - reserveTokens| Check{keepRecentTokens >=<br/>85% of triggerTokens?}

    Check -->|No Risk| Pass[Allow Default Compaction]

    Check -->|Loop Risk!| Resolve[resolvePrepareCompaction]

    Resolve --> Available{prepareCompaction<br/>Available?}

    Available -->|No| Warn[Skip Guard<br/>Warn: host missing API]

    Available -->|Yes| Adjust[Calculate Safe keepRecentTokens]

    Adjust --> Clamp{Clamp to<br/>12k - 96k range}

    Clamp --> NewPrep[Create Adjusted Preparation]

    NewPrep --> RunCompaction[Run Compaction<br/>with Adjusted Settings]

    RunCompaction --> Notify[Notify User:<br/>Adjusted keepRecentTokens]

    style Check fill:#ff9800,color:#000
    style Available fill:#ff9800,color:#000
```

---

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `COMPACTION_LOOP_RISK_RATIO` | 0.85 (85%) | Threshold ratio triggering loop risk |
| `COMPACTION_SAFE_KEEP_RATIO` | 0.50 (50%) | Target ratio for safe keepRecentTokens |
| `COMPACTION_SAFE_KEEP_MIN` | 12,000 | Minimum safe keep tokens |
| `COMPACTION_SAFE_KEEP_MAX` | 96,000 | Maximum safe keep tokens |

---

## Sequence Diagram

```mermaid
sequenceDiagram
    participant pi as pi Core
    participant ext as Extension
    participant prep as prepareCompaction

    pi->>ext: session_before_compact
    Note over ext: Extract triggerTokens<br/>= contextWindow - reserveTokens

    ext->>ext: hasCompactionLoopRisk(keepRecent, trigger)

    alt Loop Risk Detected
        ext->>prep: resolvePrepareCompaction()
        prep-->>ext: prepareCompaction function

        alt Function Available
            ext->>ext: deriveSafeKeepRecentTokens(trigger)
            Note over ext: target = trigger * 0.50<br/>clamped to 12k..96k

            ext->>prep: prepareCompaction(entries, {<br/>  keepRecentTokens: safeTarget<br/>})
            prep-->>ext: adjustedPreparation

            ext->>pi: runCompaction(adjustedPrep, ...)
            pi-->>ext: compaction result
            ext->>pi: Return { compaction }
        else Function Unavailable
            ext->>pi: Warn and skip guard
        end
    else No Risk
        ext->>pi: Allow default compaction
    end
```

---

## Implementation Notes

1. **Trigger Calculation**: `triggerTokens = contextWindow - reserveTokens`
2. **Risk Detection**: Loop risk when `keepRecentTokens >= triggerTokens * 0.85`
3. **Safe Target**: `safeTarget = clamp(triggerTokens * 0.50, 12000, 96000)`
4. **Fallback**: If `prepareCompaction` is unavailable from host, guard is skipped with warning
