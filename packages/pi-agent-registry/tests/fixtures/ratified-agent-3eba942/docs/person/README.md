---
summary: "Agent persona docs (editable canonical inputs owned by the agent)."
read_when:
  - "When defining or updating the agent persona"
---

# Agent Persona (`docs/person/`)

These six Markdown documents are **agent-owned canonical inputs** to the deterministic system-prompt compiler:

1. `README.md`
2. `identity.md`
3. `reason.md`
4. `main_task.md`
5. `dream_goal.md`
6. `behavior_rules.md`

After editing one, run `./scripts/compile-system-prompt.py`. The generated `system-prompt.md` is also agent-owned for propagation purposes, but it must never be edited by hand.
