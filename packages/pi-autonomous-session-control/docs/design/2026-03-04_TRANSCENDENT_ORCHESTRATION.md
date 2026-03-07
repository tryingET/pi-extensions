---
summary: "Vision for cognitive-driven multi-agent orchestration."
read_when:
  - "Designing the next generation agent system."
  - "Before implementing orchestration features."
system4d:
  container: "Architecture vision document."
  compass: "Integration of society.db + prompt-vault + agent-kernel + pi."
  engine: "Synthesize → design → implement."
  fog: "Scope is large; start with highest-leverage slice."
---

# TRANSCENDENT ORCHESTRATION

> "Not from this world" — an outsider should feel this is fundamentally different from any agent system they've seen.

## The Vision

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COGNITIVE ORCHESTRATOR                              │
│                                                                             │
│   "What phase am I in? What formalization level? Which cognitive tool?"    │
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                   │
│   │ meta-       │───▶│ phase       │───▶│ agent       │                   │
│   │ orchestrate │    │ dispatch    │    │ selection   │                   │
│   └─────────────┘    └─────────────┘    └─────────────┘                   │
│          │                  │                  │                           │
│          ▼                  ▼                  ▼                           │
│   ┌─────────────────────────────────────────────────────┐                 │
│   │              COGNITIVE TOOLS (30+)                   │                 │
│   │  inversion | audit | nexus | telescopic | recursion │                 │
│   │  first-principles | inversion | doppelganger | ...  │                 │
│   └─────────────────────────────────────────────────────┘                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT EXECUTION LAYER                               │
│                                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│   │   SCOUT      │  │   BUILDER    │  │   REVIEWER   │  │   RESEARCHER │ │
│   │  (explore)   │  │  (implement) │  │  (critique)  │  │   (learn)    │ │
│   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│          │                 │                 │                 │           │
│          └────────────────┬┴─────────────────┴─────────────────┘           │
│                           ▼                                                │
│   ┌──────────────────────────────────────────────────────────────────┐    │
│   │                    EVIDENCE LEDGER                                │    │
│   │   Every action records: task_id, check_type, result, details     │    │
│   └──────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SOCIETY DATABASE (society.db)                       │
│                                                                             │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│   │   repos    │ │   tasks    │ │   models   │ │  evidence  │            │
│   │  (L0-L3)   │ │ (MVCC)     │ │ (versioned)│ │ (audit)    │            │
│   └────────────┘ └────────────┘ └────────────┘ └────────────┘            │
│                                                                             │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│   │  ontology  │ │ event_log  │ │   search   │ │  lineage   │            │
│   │ (concepts) │ │ (async)    │ │  (FTS5)    │ │ (L0→L3)    │            │
│   └────────────┘ └────────────┘ └────────────┘ └────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROMPT VAULT (Dolt)                                 │
│                                                                             │
│   30 cognitive tools + 20 task templates = 50 total                        │
│                                                                             │
│   Type: cognitive  → epistemic frameworks (inversion, audit, nexus)        │
│   Type: task       → domain-specific (commit, pr, codemap)                 │
│                                                                             │
│   Every execution logged with: agent_id, tool_calls, rating                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## What Makes This Transcendent

### 1. Cognitive-First Dispatch

The system doesn't just dispatch agents — it first determines the **epistemic stance** needed:

```typescript
// Current: direct agent dispatch
dispatch_subagent({ profile: "reviewer", objective: "Review the code" })

// Transcendent: cognitive-driven dispatch
cognitive_dispatch({
  context: "I'm stuck on this authentication bug",
  // meta-orchestration determines:
  // - Phase: SENSEMAKING
  // - Formalization Level: 2 (structured but not formal)
  // - Cognitive Tool: inversion (shadow analysis)
  // - Agent: scout (explore) + reviewer (critique)
})
```

The cognitive orchestrator:
1. Analyzes the situation using `meta-orchestration` trigger
2. Selects the appropriate cognitive tool from the vault
3. Injects that tool as the agent's system prompt
4. Records the decision in `evidence` table

### 2. Evidence-Based Learning

Every action creates evidence:

```sql
INSERT INTO evidence (task_id, check_type, result, details)
VALUES (42, 'cognitive:inversion', 'pass', '{
  "hidden_bugs": 3,
  "pattern_genera": ["race-condition", "missing-cleanup"],
  "agent": "scout-1",
  "elapsed_ms": 3420
}');
```

This enables:
- **Pattern mining**: "What cognitive tools work best for what situations?"
- **Agent analytics**: "Which agents produce the best evidence?"
- **Feedback loops**: Rate outcomes → improve dispatch decisions

### 3. Ontology-Aware Agents

Agents can query the ontology for context:

```typescript
// Before starting work, get relevant concepts
const context = await ontology_context({
  company: "softwareco",
  concern: "authentication"
});
// Returns: definitions, relationships, related repos, layer constraints
```

This means agents work with **shared vocabulary** — not just code, but the concepts that govern the code.

### 4. Transcendent Iteration Loops

Built-in 100x improvement cycles:

```yaml
# chains.yaml
transcendent-fix:
  description: "DIAGNOSE → 100x → 100x → DISSOLVE → REBUILD → NAME DEBT"
  steps:
    - agent: scout
      prompt: |
        Apply INVERSION to find shadow bugs in: $INPUT
        Output: hidden bugs, pattern genera, limiting assumptions

    - agent: builder
      prompt: |
        First 100x: Fix the specimens AND the genera.
        Delete more than you add.
        $INPUT

    - agent: reviewer
      prompt: |
        Compound check: Did Phase 2 make the system simpler or more complex?
        Apply AUDIT tetrahedron (bugs/debt/smells/gaps).
        $INPUT

    - agent: builder
      prompt: |
        Second 100x: Attack the new ceiling revealed.
        If compound check failed, revert and try different approach.
        $INPUT

    - agent: documenter
      prompt: |
        Name residual debt explicitly.
        What's still imperfect and why?
        $INPUT
```

### 5. Self-Improving Pipelines

Chains evolve based on evidence:

```sql
-- Query: Which chain steps produce the best outcomes?
SELECT
  chain_name,
  step_index,
  agent,
  AVG(CASE WHEN e.result = 'pass' THEN 1 ELSE 0 END) as success_rate,
  AVG(e.details->>'$.elapsed_ms') as avg_time
FROM evidence e
JOIN task_chains tc ON e.task_id = tc.task_id
GROUP BY chain_name, step_index, agent
ORDER BY success_rate DESC, avg_time ASC;
```

This data feeds back into:
- Chain optimization (reorder steps, swap agents)
- Cognitive tool selection (which tools work best)
- Agent capability discovery (what each agent is good at)

### 6. Event-Driven Coordination

Multiple agents coordinate via `event_log`:

```sql
CREATE TABLE event_log (
  id INTEGER PRIMARY KEY,
  event_type TEXT,  -- 'agent.spawned', 'agent.progress', 'agent.completed'
  payload JSON,
  created_at TIMESTAMP,
  consumed_at TIMESTAMP  -- NULL until consumed
);
```

```typescript
// Agent 1 publishes progress
await event_publish('agent.progress', { agent: 'scout-1', findings: [...] });

// Agent 2 subscribes and adapts
const events = await event_consume({ since: lastCheck, types: ['agent.progress'] });
if (events.find(e => e.payload.findings?.includes('auth-bug'))) {
  // Adjust strategy based on scout's findings
}
```

### 7. Damage Control (Safety Rails)

Every tool call passes through safety rules:

```yaml
# damage-control-rules.yaml
bashToolPatterns:
  - pattern: "rm\\s+-rf"
    reason: "Destructive recursive delete blocked"
    ask: true  # Allow with confirmation

  - pattern: "DROP\\s+(TABLE|DATABASE)"
    reason: "SQL destruction blocked"

zeroAccessPaths:
  - ".env"
  - "~/.ssh/"
  - "*.pem"
  - "credentials.json"

readOnlyPaths:
  - "/etc/"
  - "package-lock.json"

noDeletePaths:
  - ".git/"
  - "schema/"
```

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PI EXTENSION: society-orchestrator                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Tools:                         Commands:                 Events:       │
│  ┌─────────────────────┐      ┌─────────────────┐      ┌────────────┐ │
│  │ cognitive_dispatch  │      │ /cognitive      │      │ tool_call  │ │
│  │ society_query       │      │ /agents-team    │      │ session_*  │ │
│  │ task_claim          │      │ /chain          │      │ agent_*    │ │
│  │ task_complete       │      │ /ontology       │      │            │ │
│  │ evidence_record      │      │ /evidence       │      │            │ │
│  │ ontology_context     │      │ /damage-control │      │            │ │
│  └─────────────────────┘      └─────────────────┘      └────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │ society.db  │     │ prompt-vault│     │ agent-kernel│
   │ (SQLite)    │     │ (Dolt)      │     │ (Rust CLI)  │
   └─────────────┘     └─────────────┘     └─────────────┘
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create `society-orchestrator` extension
- [ ] Wire `society.db` queries (read-only initially)
- [ ] Connect to `prompt-vault` for cognitive tools
- [ ] Implement `cognitive_dispatch` tool

### Phase 2: Orchestration (Week 2)
- [ ] Add background subagent spawning (from pi-vs-cc)
- [ ] Implement agent teams with dispatcher-only mode
- [ ] Add sequential chains with variable interpolation
- [ ] Wire damage-control safety hooks

### Phase 3: Learning (Week 3)
- [ ] Evidence recording for every action
- [ ] Pattern mining queries
- [ ] Feedback loop for cognitive tool selection
- [ ] Chain optimization based on outcomes

### Phase 4: Transcendence (Week 4)
- [ ] Event-driven coordination
- [ ] Ontology-aware agents
- [ ] Self-improving pipelines
- [ ] Transcendent iteration loops built-in

## The "Not From This World" Test

An outsider should observe:

1. **Cognitive-first** — "It thinks about HOW to think before acting"
2. **Evidence-obsessed** — "Every action creates an audit trail"
3. **Ontology-fluent** — "It speaks our conceptual language"
4. **Self-improving** — "It gets better without being told"
5. **Safe by default** — "It can't hurt the system even if it tries"
6. **Coherent** — "Everything connects — vault → db → agents → evidence"

## File Locations

```
~/.pi/agent/extensions/
├── society-orchestrator/      # Main extension
│   ├── index.ts               # Entry point
│   ├── cognitive.ts           # Cognitive dispatch logic
│   ├── agents.ts              # Agent team/chain management
│   ├── evidence.ts            # Evidence recording
│   ├── ontology.ts            # Ontology queries
│   ├── damage-control.ts      # Safety hooks
│   └── chains.yaml            # Sequential pipelines

~/ai-society/
├── society.db                 # Canonical state
├── core/prompt-vault/         # Cognitive tools
│   └── prompt-vault-db/       # Dolt database
└── softwareco/owned/agent-kernel/  # Rust CLI
    └── crates/ak-cli/         # ak command
```

## Next Session

Start with Phase 1, Slice 1:
1. Create `society-orchestrator` extension scaffold
2. Implement `society_query` tool (read from society.db)
3. Connect to `prompt-vault` via vault-client
4. Test: `society_query("SELECT * FROM tasks WHERE status = 'pending' LIMIT 5")`
