---
summary: "Decision log for prompt-vault integration boundaries and contracts."
read_when:
  - "Before changing integration boundaries between repos."
  - "When evaluating whether logic belongs in autonomy repo or vault-client."
system4d:
  container: "Architecture decisions."
  compass: "Clear ownership reduces duplication and drift."
  engine: "Decide once, reuse many times."
  fog: "Boundary confusion causes brittle integrations."
---

# Prompt-vault Integration Decision Log

## ADR-001 — Keep prompt management in vault-client

**Status:** Accepted

**Decision**
- Prompt retrieval/search/insert/rating/evaluation stay in `vault-client`.
- `pi-autonomous-session-control` does not re-implement vault SQL access.

**Why**
- Single owner for vault schema/tooling reduces drift.
- Avoid duplicated query + escaping logic across repos.
- Preserves clean autonomy vs prompt-management separation.

---

## ADR-002 — Autonomy repo consumes prompt content through an explicit Prompt Envelope

**Status:** Accepted

**Decision**
- `dispatch_subagent` accepts optional prompt envelope fields and applies content deterministically.
- Envelope provenance is returned in tool result details.

**Why**
- Enables end-to-end use now without requiring extension-to-extension RPC.
- Keeps integration additive and reversible.
- Creates a stable seam for future structured contracts.

---

## ADR-003 — `self` remains orchestration cognition, not template storage

**Status:** Accepted

**Decision**
- `self` should recommend/guide vault tool usage, not persist prompt assets.
- Any direct prompt retrieval should go through vault-client tools.

**Why**
- Avoids turning `self` into a second prompt registry.
- Keeps `self` focused on introspection, direction, crystallization, protection.

---

## ADR-004 — First slice is contract wiring, not upstream redesign

**Status:** Accepted

**Decision**
- Implement prompt-envelope wiring in this repo first.
- Defer upstream improvements (e.g., richer `vault_retrieve` details, `vault_rate` execution linkage redesign) unless they block this slice.

**Why**
- Fastest path to tangible integration value.
- Aligns with non-goal: no speculative runtime hook proposals.
- Keeps change blast radius small.

---

## ADR-005 — Background loop runtime hooks are explicitly out of scope

**Status:** Accepted (pre-existing)

**Decision**
- Do not pursue Pi-native background loop runtime hooks as default path.

**Why**
- Existing systemd/cron + Pi SDK + control-plane contracts already satisfy this need.
- Integration focus remains prompt-vault quality in this repo.

---

## Ownership summary

### `pi-autonomous-session-control`
- `self` state/introspection semantics
- `dispatch_subagent` execution and prompt application
- runtime fallback behavior when prompt envelope is missing
- integration tests for orchestration contract

### `prompt-vault` / `vault-client`
- vault schema and migration lifecycle
- template storage, retrieval, query, insertion
- prompt evaluation and variant lifecycle
- vocabulary and tag governance
- vault-side telemetry tables and stats
