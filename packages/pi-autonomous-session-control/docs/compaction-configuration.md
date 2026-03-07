---
summary: "Configuration requirements and complete event flow for compaction."
read_when:
  - "Setting up compaction in settings.json."
  - "Understanding the complete compaction flow."
system4d:
  container: "Configuration and event flow documentation."
  compass: "Explain required settings and how events flow through the system."
  engine: "Sequence diagrams + configuration tables."
  fog: "Settings may need adjustment per model context window."
---
# Compaction Configuration

Part of [[custom-compaction-architecture|Custom Compaction Architecture]].

---

## Configuration Requirements

The extension expects these compaction settings in `~/.pi/agent/settings.json`:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 24000
  }
}
```

| Setting | Recommended | Purpose |
|---------|-------------|---------|
| `enabled` | `true` | Enable auto-compaction |
| `reserveTokens` | ~16384 | Tokens reserved for LLM response |
| `keepRecentTokens` | ~24000 | Recent tokens to keep (guard adjusts if too high) |

```mermaid
graph LR
    subgraph "Required Settings"
        A[compaction.enabled: true]
        B[compaction.reserveTokens: ~16384]
        C[compaction.keepRecentTokens: ~24000]
    end

    subgraph "Guard Behavior"
        D[If keepRecentTokens too high<br/>→ Guard lowers it for that run]
    end

    A --> D
    B --> D
    C --> D
```

---

## Complete Event Flow

```mermaid
sequenceDiagram
    participant user as User/Model
    participant pi as pi Core
    participant ext as Extension
    participant watchdog as Watchdog

    Note over user,watchdog: Normal Operation

    user->>pi: Trigger compaction
    pi->>ext: session_before_compact

    ext->>ext: Calculate triggerTokens
    ext->>ext: Check loop risk

    alt Loop Risk
        ext->>ext: Adjust keepRecentTokens
        ext->>pi: Return adjusted compaction
    end

    Note over user,watchdog: Failure Recovery

    user->>pi: Tool call (fails)
    pi->>ext: tool_result (error)

    ext->>ext: Count failures

    alt Burst Detected
        ext->>ext: Check cooldown
        ext->>watchdog: compactWithWatchdog

        watchdog->>pi: ctx.compact()

        alt Success
            pi-->>watchdog: onComplete
            watchdog->>pi: Notify success
        else Timeout (2min)
            watchdog->>pi: ctx.abort()
            watchdog->>pi: Notify timeout
        end
    end
```

---

## See Also

- [[compaction-guard|Compaction Guard]] - Loop-risk interception
- [[failure-recovery-compaction|Failure Recovery]] - Automatic recovery triggers
- [[compaction-helpers|Compaction Helpers]] - Instructions and API discovery
