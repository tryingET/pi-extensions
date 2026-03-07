---
summary: "Helper functions for compaction: instructions merging and API discovery."
read_when:
  - "Understanding how custom instructions are merged."
  - "Debugging prepareCompaction resolution."
system4d:
  container: "Detailed documentation for compaction helpers."
  compass: "Explain instruction building and host API discovery."
  engine: "Flowcharts + sequence diagrams."
  fog: "Host API layout may change; fallback path may need updates."
---
# Compaction Helpers

Part of [[custom-compaction-architecture|Custom Compaction Architecture]].

---

## Custom Instructions Merging

All compaction operations can include custom focus instructions that are merged with the base autonomy focus.

```mermaid
flowchart LR
    subgraph Input
        CI[customInstructions?]
    end

    subgraph Processing
        Trim{Trimmed &<br/>Non-empty?}
        Merge[Prepend base focus<br/>+ add custom focus]
        Base[Use base focus only]
    end

    subgraph Output
        Final[Final Instructions]
    end

    CI --> Trim

    Trim -->|Yes| Merge
    Trim -->|No| Base

    Merge --> Final
    Base --> Final
```

### Base Focus

```typescript
const AUTONOMY_COMPACTION_FOCUS = `
Compress aggressively while preserving engineering continuity.
Prioritize explicit decisions, unresolved risks, invariants,
and exact file paths/functions/errors.
Drop repetitive narration and keep the summary concise
enough to avoid repeat compaction churn.
`;
```

### Building Logic

```mermaid
sequenceDiagram
    participant caller as Caller
    participant helper as buildCompactionInstructions
    participant compaction as Compaction Engine

    caller->>helper: buildCompactionInstructions(customInstructions)

    alt Custom Instructions Provided
        helper->>helper: Trim whitespace
        helper->>helper: Check non-empty
        helper->>helper: Merge: base + "\n\nAdditional focus: " + custom
        helper-->>caller: Merged instructions
    else No Custom Instructions
        helper-->>caller: Base AUTONOMY_COMPACTION_FOCUS
    end

    caller->>compaction: Pass instructions to compaction
```

---

## resolvePrepareCompaction: Host API Discovery

The extension uses dynamic module resolution to find the `prepareCompaction` function from pi's API.

```mermaid
flowchart TD
    Start[resolvePrepareCompaction] --> Cache{Cached?}

    Cache -->|Yes| ReturnCache[Return cached result]

    Cache -->|No| Import[Import @mariozechner/pi-coding-agent]

    Import --> TopLevel{Top-level<br/>prepareCompaction?}

    TopLevel -->|Found| CacheTop[Cache and return]

    TopLevel -->|Not Found| Fallback[Try fallback path]

    Fallback --> ResolvePath[Resolve package entry URL]

    ResolvePath --> BuildPath[Build path to<br/>core/compaction/compaction.js]

    BuildPath --> ImportFallback[Import fallback module]

    ImportFallback --> FallbackCheck{Fallback<br/>prepareCompaction?}

    FallbackCheck -->|Found| CacheFallback[Cache and return]

    FallbackCheck -->|Not Found| CacheNull[Cache null and return null]

    style TopLevel fill:#4caf50,color:#fff
    style FallbackCheck fill:#ff9800,color:#000
    style CacheNull fill:#f44336,color:#fff
```

### Resolution Strategy

```mermaid
graph TB
    subgraph "Primary Resolution"
        A1["import '@mariozechner/pi-coding-agent'"]
        A2[Check .prepareCompaction property]
    end

    subgraph "Fallback Resolution"
        B1[import.meta.resolve to get entry URL]
        B2[Convert URL to file path]
        B3["Join with 'core/compaction/compaction.js'"]
        B4[Import fallback module]
        B5[Check .prepareCompaction property]
    end

    subgraph "Result"
        C1[Return function]
        C2[Return null]
    end

    A1 --> A2
    A2 -->|Found| C1
    A2 -->|Not Found| B1
    B1 --> B2 --> B3 --> B4 --> B5
    B5 -->|Found| C1
    B5 -->|Not Found| C2
```

---

## Implementation Notes

1. **Caching**: Result is cached after first resolution
2. **Fallback Path**: Handles different package export layouts
3. **Graceful Degradation**: Returns null if unavailable, guard skips intervention
