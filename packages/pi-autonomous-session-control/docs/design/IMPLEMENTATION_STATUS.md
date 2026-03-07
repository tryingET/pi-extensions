---
summary: "Implementation status of design proposals from SYSTEMS_ASSESSMENT and TRANSCENDENT_ORCHESTRATION."
read_when:
  - "Before implementing orchestration features."
  - "Checking what's done vs what's planned."
system4d:
  container: "Design-to-implementation tracking."
  compass: "Know what exists, what's planned, what's deferred."
  engine: "Compare proposals → verify state → document gaps."
  fog: "Design docs age; this matrix tracks reality."
---

# Implementation Status Matrix

**Last updated:** 2026-03-05
**Source docs:** `2026-03-04_SYSTEMS_ASSESSMENT.md`, `2026-03-04_TRANSCENDENT_ORCHESTRATION.md`

Scope note: this matrix tracks orchestration proposals from the two design docs above. Self-memory lifecycle status is tracked in [Status](../dev/status.md).

## Summary

| Category | Proposed | Implemented | Partial | Not Started |
|----------|----------|-------------|---------|-------------|
| Prompt-vault | 1 | 1 | 0 | 0 |
| Cognitive tools | 4 | 4 | 0 | 0 |
| Loop templates | 2 | 2 | 0 | 0 |
| Loop engine | 1 | 0 | 0 | 1 |
| Society.db integration | 4 | 1 | 0 | 3 |
| Agent-kernel CLI | 1 | 0 | 0 | 1 |
| KES/diary integration | 1 | 0 | 0 | 1 |
| Agent teams | 1 | 1 | 0 | 0 |

---

## Prompt-Vault

| Feature | Proposed In | Status | Notes |
|---------|-------------|--------|-------|
| Cognitive tools (30+) | TRANSCENDENT | ✅ Done | 50+ templates now |
| `loop` template type | SYSTEMS | ✅ Done | Added 2026-03-04 |

## Cognitive Tools (OODA phases)

| Tool | Phase | Status | Notes |
|------|-------|--------|-------|
| `signal-triage` | Observe | ✅ Done | Added 2026-03-04 |
| `hypothesis-board` | Orient | ✅ Done | Added 2026-03-04 |
| `option-space` | Decide | ✅ Done | Added 2026-03-04 |
| `mid-flight-correction` | Act | ✅ Done | Added 2026-03-04 |

## Loop Templates

| Template                 | Type | Status        | Notes                        |
| ------------------------ | ---- | ------------- | ---------------------------- |
| `ooda`                   | loop | ✅ Done        | Phase→tool mapping complete  |
| `transcendent-iteration` | loop | ✅ Done        | Migrated from cognitive      |
| `mito`                   | loop | ❌ Not started | YAGNI — defer until use case |
| `kaizen`                 | loop | ❌ Not started | YAGNI — defer until use case |
| `adkar`                  | loop | ❌ Not started | YAGNI — defer until use case |

## Loop Engine

| Component | Proposed In | Status | Notes |
|-----------|-------------|--------|-------|
| Plugin interface (LoopPlugin) | SYSTEMS | ❌ Not started | Design exists, no code |
| Phase execution | SYSTEMS | ❌ Not started | Would call cognitive tools per phase |
| `loop_execute` tool | — | ✅ Done | Exists in society-orchestrator but uses different schema |
| Stop conditions | SYSTEMS | ❌ Not started | Documented in ooda template only |
| Evidence per phase | SYSTEMS | ❌ Not started | Schema supports, not wired |

## Society.db Integration

| Feature | Proposed In | Status | Notes |
|---------|-------------|--------|-------|
| `society_query` tool | TRANSCENDENT | ✅ Done | Read access working |
| `evidence_record` tool | TRANSCENDENT | ❌ Not started | Schema exists, tool not wired here |
| `task_claim` tool | TRANSCENDENT | ❌ Not started | In society-orchestrator |
| `ontology_context` tool | TRANSCENDENT | ❌ Not started | In society-orchestrator |

## Agent-Kernel CLI

| Feature | Proposed In | Status | Notes |
|---------|-------------|--------|-------|
| `ak` CLI wrapper | SYSTEMS | ❌ Not started | Still using raw SQL |
| Replace SQL with `ak` | SYSTEMS | ❌ Not started | Migration needed |

## KES/Diary Integration

| Feature | Proposed In | Status | Notes |
|---------|-------------|--------|-------|
| Write to `diary/` | SYSTEMS | ❌ Not started | No session capture |
| Crystallization flow | SYSTEMS | ❌ Not started | Pattern detection not implemented |
| Tips propagation | SYSTEMS | ❌ Not started | Not implemented |

## Agent Teams

| Feature | Proposed In | Status | Notes |
|---------|-------------|--------|-------|
| `dispatch_subagent` | TRANSCENDENT | ✅ Done | Working with spark model |
| Background spawn | TRANSCENDENT | ❌ Not started | Sequential only currently |
| Agent teams (scout/builder/reviewer) | TRANSCENDENT | ❌ Not started | Single agent only |
| Sequential chains | TRANSCENDENT | ⚠️ Partial | chains.yaml design exists |

## Damage Control

| Feature | Proposed In | Status | Notes |
|---------|-------------|--------|-------|
| Safety hooks | TRANSCENDENT | ❌ Not started | Not implemented |
| Zero-access paths | TRANSCENDENT | ❌ Not started | Not implemented |
| Read-only paths | TRANSCENDENT | ❌ Not started | Not implemented |

---

## Priority Matrix

### High Value, Low Effort (Do Next)
- Wire `evidence_record` to dispatch_subagent phases
- Implement stop conditions in loop execution

### High Value, High Effort (Plan)
- Loop engine with plugin interface
- KES/diary integration

### Low Value, Low Effort (Pick Up)
- Add MITO/kaizen/ADKAR when use cases emerge

### Low Value, High Effort (Defer)
- Background agent spawn with widgets
- Full damage control system

---

## Change Log

| Date | Change |
|------|--------|
| 2026-03-04 | Initial matrix; added `loop` type, `ooda` template, 4 cognitive tools |
