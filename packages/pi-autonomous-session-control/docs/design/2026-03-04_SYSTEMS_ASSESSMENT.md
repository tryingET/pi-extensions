---
summary: "Assessment of existing systems vs society-orchestrator and integration needs."
read_when:
  - "Before modifying society-orchestrator."
  - "When integrating with KES, DSPx, diaries, loops."
system4d:
  container: "Systems analysis document."
  compass: "Identify gaps, propose unified architecture."
  engine: "Analyze → map → propose."
  fog: "Many moving parts - focus on highest-leverage integrations."
---

# Systems Assessment

## What Exists

### 1. KES (Knowledge Evolution System)

**Pattern:**
```
Session → diary/ (raw) → docs/learnings/ (crystallized) → tips/meta/ (propagated)
```

**Location:** Every repo has `diary/` with README.md defining the contract

**Status:** ✅ Implemented in templates, used across repos

**Gap in society-orchestrator:** No diary integration - orchestrator doesn't write to `diary/`

---

### 2. DSPx (Oracle)

**Purpose:** DSPy toolkit for signature generation, refinement, optimization

**Location:** `~/ai-society/softwareco/owned/dspx/`

**Capabilities:**
- `signature gen` — generate DSPy signatures
- `signature refine` — refine signatures
- `module-gen` — generate modules
- `optimize gepa` — optimization with GEPA
- MLflow integration for telemetry

**Status:** ✅ Working CLI

**Gap in society-orchestrator:** No DSPx integration - could use signatures for cognitive tool templates

---

### 3. Society.db

**Schema:**
```sql
repos(path, company, archetype, layer, ...)
tasks(id, repo, title, status, priority, claimed_by, ...)
models(id, repo, concern, version, payload, ...)
evidence(id, task_id, check_type, result, details, ...)
ontology(id, concept, definition, source_repo, layer)
event_log(id, event_type, payload, created_at, consumed_at)
template_lineage(child_repo, parent_template, layer_transition)
search — FTS5 virtual table
```

**Status:** ✅ Operational (135KB, 1 evidence entry)

**Gap in society-orchestrator:** Uses raw SQL instead of `ak` CLI commands

---

### 4. Agent-kernel (Rust CLI)

**Location:** `~/ai-society/softwareco/owned/agent-kernel/`

**Commands:**
```bash
ak task create --repo <path> "<title>"
ak task ready
ak task claim <id> --agent <name> --lease 3600
ak task complete <id> --result '<json>'
ak evidence record --task <id> --check-type <type> --result pass|fail
ak model get <repo> <concern>
ak ontology search <query>
```

**Status:** ✅ Built, needs pi-extension

**Gap in society-orchestrator:** Not integrated - should use `ak` instead of raw SQL

---

### 5. Prompt-vault

**Contents:** 30 cognitive tools + 20 task templates in Dolt

**Cognitive Tools:** inversion, audit, nexus, telescopic, meta-orchestration, recursion-engine, etc.

**Status:** ✅ Connected to vault-client

**Integrated in society-orchestrator:** ✅ Yes

---

### 6. RFCs for MITO/OODA

**Documents:**
- `RFC-bigpicture-SocietyS3_MITO_OODA_Others.md`
- `RFC-implementation-SocietyS3_MITO_OODA.md`
- `RFC-tool-contracts-SocietyS3.md`

**Proposed Tools (not implemented):**
- Observe: `society_signal_scan`, `society_context_budget_guard`, `society_dependency_map`
- Orient: `society_evidence_matrix`, `society_hypothesis_board`, `society_policy_lookup`
- Decide: `society_risk_score`, `society_option_ranker`, `society_gatekeeper`
- Act: `society_runbook_exec`, `society_change_packet`, `society_artifact_publish`

**Status:** ⚠️ Designed but not implemented

---

### 7. Loop System (kaizen, adkar, ooda, mito)

**Found:** Design docs only - no implementation found

**Mentioned in:**
- RFCs (OODA, MITO)
- dep-diet docs (PDCA, MITO linkage)
- pi_agent_rust test fixtures (kaizen skill)

**Status:** ❌ Not implemented as pluggable system

---

## What's Missing in Society-Orchestrator

| System | Integration Status | What's Needed |
|--------|-------------------|---------------|
| KES/diary | ❌ Not integrated | Write session captures to `diary/` |
| DSPx | ❌ Not integrated | Use signatures for cognitive tools |
| agent-kernel CLI | ❌ Using raw SQL | Replace SQL with `ak` commands |
| Loop system | ❌ Not implemented | Create pluggable loop framework |
| OODA tools | ❌ Not implemented | Build observe/orient/decide/act tools |
| MITO tools | ❌ Not implemented | Build mission/intelligence/tooling/operations tools |
| Prompt-vault | ✅ Integrated | Already connected |

---

## Proposed Unified Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SOCIETY ORCHESTRATOR v2                                 │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    LOOP ENGINE (pluggable)                           │  │
│   │                                                                      │  │
│   │   Plugins: ooda | mito | kaizen | adkar | pdca | custom            │  │
│   │                                                                      │  │
│   │   Each plugin provides:                                             │  │
│   │   - phases: string[]                                                │  │
│   │   - transition(from, to, context): ActionResult                    │  │
│   │   - validate(context): boolean                                      │  │
│   │   - artifacts: string[] (what gets emitted)                        │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    COGNITIVE LAYER                                   │  │
│   │                                                                      │  │
│   │   prompt-vault (30 cognitive tools)                                 │  │
│   │   dspx signatures (refined prompts)                                 │  │
│   │   meta-orchestration (phase detection)                              │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    AGENT EXECUTION                                   │  │
│   │                                                                      │  │
│   │   scout | builder | reviewer | researcher                          │  │
│   │   Background spawn + live widgets                                   │  │
│   │   Session persistence for continuation                              │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    KES FLOW (knowledge evolution)                    │  │
│   │                                                                      │  │
│   │   session → diary/ → docs/learnings/ → tips/meta/                  │  │
│   │                                                                      │  │
│   │   Every action creates:                                             │  │
│   │   - diary entry (raw capture)                                       │  │
│   │   - evidence record (in society.db via ak)                          │  │
│   │   - crystallization candidate (if pattern found)                   │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    SOCIETY.DB (via agent-kernel CLI)                 │  │
│   │                                                                      │  │
│   │   ak task claim | complete | fail                                   │  │
│   │   ak evidence record                                                │  │
│   │   ak model get | version                                            │  │
│   │   ak ontology search                                                │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Loop Engine Design

### Plugin Interface

```typescript
interface LoopPlugin {
  name: string;           // "ooda" | "mito" | "kaizen" | "adkar" | "pdca"
  phases: string[];       // ["observe", "orient", "decide", "act"]
  description: string;

  // Called when entering a phase
  onEnter(phase: string, context: LoopContext): Promise<void>;

  // Called when exiting a phase
  onExit(phase: string, context: LoopContext): Promise<Artifact[]>;

  // Validate before transition
  validate(from: string, to: string, context: LoopContext): boolean;

  // Cognitive tools to inject per phase
  cognitiveTools: Record<string, string[]>;  // phase -> tool names
}

interface LoopContext {
  sessionId: string;
  objective: string;
  currentPhase: string;
  history: PhaseResult[];
  artifacts: Artifact[];
  diary: DiaryWriter;
  db: SocietyDB;
}

interface Artifact {
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}
```

### Built-in Plugins

```typescript
// OODA Loop
const oodaPlugin: LoopPlugin = {
  name: "ooda",
  phases: ["observe", "orient", "decide", "act"],
  cognitiveTools: {
    observe: ["telescopic", "dependency-cartography"],
    orient: ["inversion", "audit", "evidence-matrix"],
    decide: ["nexus", "constraint-inventory", "decision"],
    act: ["controlled", "escape-hatch", "atomic-completion"],
  },
  // ...
};

// MITO Loop
const mitoPlugin: LoopPlugin = {
  name: "mito",
  phases: ["mission", "intelligence", "tooling", "operations"],
  cognitiveTools: {
    mission: ["first-principles", "nexus"],
    intelligence: ["telescopic", "inversion", "knowledge-crystallization"],
    tooling: ["audit", "blast-radius", "escape-hatch"],
    operations: ["controlled", "atomic-completion", "temporal-degradation"],
  },
  // ...
};

// Kaizen (PDCA)
const kaizenPlugin: LoopPlugin = {
  name: "kaizen",
  phases: ["plan", "do", "check", "act"],
  cognitiveTools: {
    plan: ["first-principles", "nexus", "constraint-inventory"],
    do: ["controlled", "atomic-completion"],
    check: ["audit", "inversion", "mirror"],
    act: ["knowledge-crystallization", "elevate"],
  },
  // ...
};

// ADKAR (Change Management)
const adkarPlugin: LoopPlugin = {
  name: "adkar",
  phases: ["awareness", "desire", "knowledge", "ability", "reinforcement"],
  cognitiveTools: {
    awareness: ["telescopic", "dependency-cartography"],
    desire: ["nexus", "decision"],
    knowledge: ["knowledge-crystallization", "first-principles"],
    ability: ["controlled", "atomic-completion"],
    reinforcement: ["elevate", "temporal-degradation"],
  },
  // ...
};
```

### Loop Execution

```typescript
async function runLoop(
  plugin: LoopPlugin,
  objective: string,
  ctx: ExtensionContext,
): Promise<LoopResult> {
  const context: LoopContext = {
    sessionId: generateId(),
    objective,
    currentPhase: plugin.phases[0],
    history: [],
    artifacts: [],
    diary: createDiaryWriter(ctx.cwd),
    db: createSocietyDB(),
  };

  // Write session start to diary
  context.diary.writeEntry({
    type: "loop-start",
    plugin: plugin.name,
    objective,
    timestamp: new Date(),
  });

  for (const phase of plugin.phases) {
    context.currentPhase = phase;

    // Get cognitive tools for this phase
    const tools = plugin.cognitiveTools[phase] || [];

    // Inject cognitive tool as system prompt
    const cognitivePrompt = await buildCognitivePrompt(tools, objective);

    // Dispatch agent with cognitive injection
    const result = await cognitive_dispatch({
      context: `Phase: ${phase}\n\n${objective}`,
      cognitive_tool: tools[0],  // Primary tool
      agent: selectAgentForPhase(phase),
    });

    // Record evidence
    await ctx.db.evidenceRecord({
      check_type: `loop:${plugin.name}:${phase}`,
      result: result.exitCode === 0 ? "pass" : "fail",
      details: { artifacts: result.artifacts },
    });

    // Phase exit
    const artifacts = await plugin.onExit(phase, context);
    context.artifacts.push(...artifacts);

    // Write phase completion to diary
    context.diary.writeEntry({
      type: "phase-complete",
      phase,
      result: result.output.slice(0, 1000),
      artifacts: artifacts.map(a => a.type),
    });
  }

  // Crystallization check
  const patterns = await detectPatterns(context.history);
  if (patterns.length > 0) {
    await crystallizeToLearnings(patterns, ctx.cwd);
  }

  return {
    plugin: plugin.name,
    objective,
    phases: context.history,
    artifacts: context.artifacts,
  };
}
```

---

## What Must Change

### 1. Society-Orchestrator Extension

**Changes:**
- Add loop engine with plugin system
- Replace raw SQL with `ak` CLI calls
- Integrate diary writing
- Add KES crystallization flow

### 2. New Files Needed

```
~/.pi/agent/extensions/society-orchestrator/
├── index.ts           # Entry point (update)
├── loops/             # NEW: Loop plugins
│   ├── engine.ts      # Loop execution engine
│   ├── types.ts       # Plugin interfaces
│   ├── ooda.ts        # OODA plugin
│   ├── mito.ts        # MITO plugin
│   ├── kaizen.ts      # Kaizen/PDCA plugin
│   └── adkar.ts       # ADKAR plugin
├── kes/               # NEW: Knowledge evolution
│   ├── diary.ts       # Diary writer
│   ├── crystallize.ts # Pattern detection + crystallization
│   └── tips.ts        # Tip propagation
├── agent-kernel.ts    # NEW: CLI wrapper
└── chains.yaml        # Existing
```

### 3. agent-kernel Integration

**Current (society-orchestrator):**
```typescript
// Raw SQL
const result = querySociety("SELECT * FROM tasks WHERE status = 'pending'");
execSociety("INSERT INTO evidence ...");
```

**Should be:**
```typescript
// Via ak CLI
const tasks = await ak.taskReady();
await ak.evidenceRecord({ task_id: 1, check_type: "cognitive:dispatch", result: "pass" });
```

### 4. DSPx Integration (Optional)

**Use DSPx signatures for cognitive tools:**
```typescript
// Instead of hardcoded prompts
const signature = await dspx.signatureRefine({
  task: "Apply inversion to find shadow bugs",
  attempts: 3,
});
// Use refined signature as agent system prompt
```

---

## Priority Order

| Priority | Task | Impact |
|----------|------|--------|
| **H** | Add loop engine + OODA plugin | Enables structured iteration |
| **H** | Replace SQL with `ak` CLI | Proper agent-kernel integration |
| **H** | Add diary writing | KES integration |
| **M** | Add MITO, kaizen, adkar plugins | More loop patterns |
| **M** | Add crystallization flow | Knowledge evolution |
| **L** | DSPx integration | Signature refinement |
| **L** | Background widgets | Parallel execution |

---

## Next Session

Start with:
1. Create `loops/engine.ts` with plugin interface
2. Implement OODA plugin
3. Add diary writer
4. Replace SQL with `ak` CLI wrapper
5. Test: `/loop ooda "Fix the authentication bug"`
