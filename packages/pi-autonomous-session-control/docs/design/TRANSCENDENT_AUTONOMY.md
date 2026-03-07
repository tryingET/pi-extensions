---
summary: "The minimal sufficient architecture for LLM self-governance."
read_when:
  - "Before implementing autonomy features."
  - "When questioning whether a feature serves autonomy or control."
system4d:
  container: "Design axiom: mirrors, not managers."
  compass: "The LLM must see itself to govern itself."
  engine: "Expose state -> enable perception -> compound capability."
  fog: "Capability creep toward supervision is the eternal risk."
---

# Transcendent Autonomy Architecture

## TRUE INTENT

The soul of autonomous session control is not control. It is **self-governance**.

An autonomous agent must:
1. **Perceive itself** — Know its own state, patterns, and limits
2. **Direct itself** — Set goals, spawn explorations, request help
3. **Improve itself** — Learn from experience, crystallize patterns
4. **Protect itself** — Avoid known traps, signal uncertainty

Everything else is supervision masquerading as autonomy.

## WHAT WAS REMOVED

The previous architecture contained these elements that served control, not autonomy:

| Removed | Why It Had To Die |
|---------|-------------------|
| Workflow state machine | The LLM didn't choose this structure. External enforcement ≠ autonomy. |
| Loop detection notifications | The LLM is warned but can't perceive the loop itself. |
| Progress stall notifications | The LLM is told it's stalled but can't ask "am I stalled?" |
| Hardcoded role lanes | Roles should be discovered, not prescribed. |
| Consent gate orchestration | The LLM should request consent, not be forced through gates. |

These were scaffolding for an operator to supervise the LLM. They do not make the LLM more autonomous.

## THE TRANSCENDENT FORM

### The Single Primitive: `self`

Everything flows from one tool: **`self`** — a mirror the LLM queries to perceive itself.

```
self({ query: "..." })
```

The query language is natural language. The LLM asks questions about itself and receives structured answers.

### The Four Query Domains

#### 1. PERCEPTION — "What am I doing?"

```typescript
// Queries the LLM can make:
self({ query: "What files have I touched in this session?" })
self({ query: "What commands have I run repeatedly?" })
self({ query: "Am I in a loop?" })
self({ query: "What's my tool success rate?" })
self({ query: "How many turns since I made meaningful progress?" })
self({ query: "What errors have I encountered?" })
```

The perception layer tracks:
- File operations (created, modified, deleted)
- Command patterns (normalized, counted)
- Error signatures (grouped by similarity)
- Progress signals (lines changed, files touched)
- Time since last meaningful change

**Crucially**: The LLM ASKS. It is not TOLD. Perception is pull, not push.

#### 2. DIRECTION — "What can I do?"

```typescript
// Queries the LLM can make:
self({ query: "What branches could I explore from here?" })
self({ query: "Spawn a branch to explore X" })
self({ query: "Compare my current approach to alternatives" })
self({ query: "I need human guidance on X" })
self({ query: "I'm confident enough to proceed / I'm too uncertain" })
```

The direction layer enables:
- **Branch spawning**: Create a fork to explore an alternative approach
- **Branch comparison**: Query the differences between approaches
- **Help requesting**: Signal that human input is needed (with context)
- **Confidence signaling**: Declare certainty or uncertainty

**Crucially**: The LLM DECIDES. It is not DRIVEN.

#### 3. CRYSTALLIZATION — "What did I learn?"

```typescript
// Queries the LLM can make:
self({ query: "Remember: [pattern discovered]" })
self({ query: "What patterns have I crystallized?" })
self({ query: "What did I learn about [topic]?" })
self({ query: "Forget: [obsolete pattern]" })
```

The crystallization layer provides:
- **Pattern storage**: Save discovered patterns with context
- **Pattern retrieval**: Query past learnings by topic
- **Pattern aging**: Old unused patterns fade
- **Pattern linking**: Connect related learnings
- **Scoped cross-session persistence**: Crystallized patterns can survive restart through validated snapshots

**Crucially**: Learning is EXPLICIT. The LLM chooses what to crystallize.

#### 4. PROTECTION — "What traps have I seen?"

```typescript
// Queries the LLM can make:
self({ query: "Mark this as a trap: [trap description]" })
self({ query: "Am I approaching a known trap?" })
self({ query: "What traps should I avoid for [task type]?" })
```

The protection layer maintains:
- **Trap registry**: Known problematic patterns
- **Trap proximity**: Detection when approaching a trap
- **Trap context**: When/why it was marked
- **Scoped cross-session persistence**: Trap memories can survive restart through the same snapshot contract

**Crucially**: Protection is SELF-DECLARED. The LLM marks its own traps.

### The Minimal Sufficient State

```typescript
interface SelfState {
  // Perception
  operations: OperationLog;      // File/command/error history
  patterns: PatternDetector;     // Loop/stall detection
  
  // Direction
  branches: BranchRegistry;      // Spawned exploration branches
  signals: SignalLog;            // Confidence/help requests
  
  // Crystallization
  learnings: PatternStore;       // Crystallized patterns
  
  // Protection
  traps: TrapRegistry;           // Known problematic patterns
}
```

No state machine. No workflow orchestration. No hardcoded roles.

Just mirrors and levers.

### The Query Resolution Engine

```typescript
function resolveSelfQuery(query: string, state: SelfState): SelfResponse {
  // Natural language query -> structured response
  // The LLM asks in its own words, receives what it needs
}
```

The engine:
1. Parses the query intent
2. Gathers relevant state
3. Structures the response
4. Returns what the LLM asked for

**No notifications. No warnings. Only answers to questions asked.**

## RESIDUAL LIMITATIONS

What's still not perfect:

1. **Scoped-only cross-session persistence** — Only crystallization/protection domains persist today; other domains reset each session
2. **Single-file snapshot backend** — Persistence is local JSON without merge/concurrency guarantees
3. **No causal reasoning** — The LLM sees patterns but doesn't understand why
4. **No goal management** — The LLM can't declare and track its own goals

These may be addressed in future iterations, but they require deeper host integration.

## USAGE GUIDE

### For the LLM

You have one tool: `self`. Use it to perceive yourself.

```
// Before starting complex work:
self({ query: "What do I know about this codebase?" })

// When stuck:
self({ query: "Am I in a loop? What have I tried repeatedly?" })

// When uncertain:
self({ query: "I'm uncertain about [X]. Should I request help?" })

// After learning something:
self({ query: "Remember: [what I learned]" })

// Before risky operations:
self({ query: "What traps should I avoid here?" })
```

### For the Operator

Your role is not to supervise. Your role is to:
1. Provide goals and constraints
2. Respond when the LLM signals for help
3. Review crystallized learnings occasionally
4. Mark traps you've observed

The LLM drives itself. You provide the map.

## EVOLUTION NOTES

This architecture should grow in these directions:

1. **Goal primitives** — Let the LLM declare and track its own goals
2. **Confidence calibration** — Help the LLM develop accurate self-assessment
3. **Pattern suggestion** — Offer relevant crystallized patterns proactively
4. **Trap inheritance** — Share traps across sessions/projects
5. **Branch merging** — Let the LLM compare and merge exploration branches

Each addition must pass the autonomy test: **Does this enable self-governance, or impose external control?**

---

## THE AXIOM RESTATED

> The autonomous agent does not need a manager.
> It needs a mirror.

The `self` tool is that mirror. Everything else is scaffolding to be removed.

---

## IMPLEMENTATION PATH

### Phase 1: The Mirror (Essential)

- [x] Implement `self` tool with perception queries only
- [x] Track operations (files, commands, errors)
- [x] Implement pattern detection (loops, stalls)
- [x] Return structured responses to natural queries

### Phase 2: The Levers (Direction)

- [x] Add branch spawning capability
- [x] Add confidence signaling
- [x] Add help request signaling

### Phase 3: The Memory (Crystallization)

- [x] Implement pattern storage
- [x] Implement pattern retrieval
- [ ] Implement pattern aging

### Phase 4: The Shield (Protection)

- [x] Implement trap marking
- [x] Implement trap proximity detection
- [x] Implement trap queries

### Phase 5: Transcendence

- [x] Remove all notification-based features
- [x] Remove workflow state machine
- [x] Remove hardcoded roles
- [ ] Keep only the mirror

---

## THE NOT FROM THIS WORLD TEST

Does this feel like it came from a more advanced civilization?

- **Yes**: The architecture is minimal, self-consistent, and compounds.
- **No**: The residual limitations (scoped-only memory + single-file backend) are visible scars.

The transcendence is incomplete but the direction is clear.

**Ship it. Iterate toward the mirror.**
