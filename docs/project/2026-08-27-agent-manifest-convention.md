---
summary: "Agent manifest convention v1 plus the Fleet Phase-0 execution quarantine."
read_when:
  - "Authoring or validating a standing-agent agent.json manifest."
  - "Changing pi-agent-registry discovery, resolution, or dispatch posture."
type: "reference"
---

# Agent manifest convention v1 (AK 5098/5100)

A standing agent is declared by an `agent.json` at its agent-repo root. The
registry resolver (`pi-agent-registry`) maps the agent name to composed,
read-only inspection metadata: persona, skills, tools, defaults, scope, and
activities.

**Fleet Phase 0 (AK 5130): standing-agent execution is disabled.**
`dispatch_agent` is a static confirmed-no-effects gate and does not resolve a
manifest or route through `dispatch_subagent`, fork, scout, candidate,
workflow, or loop surfaces. Those peer/workflow tools remain separate explicit
capabilities, not standing-agent launch adapters. AK 5132 owns any future
exact-task, immutable-receipt, read-only ASC launch contract.

## Schema (agent.json)

```json
{
  "schema": "ai-society.agent/1",
  "name": "agent-adoption-steward",
  "version": "0.1.0",
  "display_name": "Adoption Steward",
  "system_prompt_file": "docs/person/system-prompt.md",
  "skills": {
    "profile": "ec-py",
    "extra": ["softwareco-owned-repo-router"]
  },
  "tools": ["read", "bash", "edit", "write"],
  "extensions": [],
  "defaults": {
    "model": null,
    "thinking": "medium"
  },
  "scope": {
    "repos": ["/home/tryinget/ai-society/softwareco/owned/*"],
    "forbidden": [".git", "node_modules", "society.v2.db"]
  },
  "activities": ["prompts/activities/*.md"]
}
```

Rules:
- `system_prompt_file` — required; the persona/system prompt (the ONLY place
  the agent's identity lives).
- `skills.profile` — optional; a named skill-profile bundle. Engineering-core
  emits `skills/profiles.json` (`ec-py`, `ec-ts.frontend`, `ec-defaults`,
  `ec-full`, …). `skills.extra` — additional named skills by name.
  Resolution: profile members + extras → materialized `--skill` dirs at spawn.
- `tools` — required; the least-privilege allowlist (subset of available
  tools). Empty array = read-only agent.
- `extensions` — optional child-only extension allowlist (e.g. ["vault-client"]).
- `defaults.model` — null = inherit parent.
- `scope.repos` — advisory path scope for the agent's work (not a sandbox);
  rendered into the system prompt as its operating territory.
- `activities` — activity prompt files (recurring work templates).

## Resolution contract

registry.resolve(name) -> {
  systemPrompt: <file contents + scope rendering>,
  skillDirs: [materialized dirs],
  tools, thinking, model, extensions
}

This resolution object is inspectable through `agent_registry` and is not
execution authority. Materialized skill directories are cleaned up after the
read-only inspection action. No public Phase-0 path may turn the object into a
child launch.

Fail-closed: unknown skill name, missing system-prompt file, unknown profile
key, or schema mismatch => resolution error. Independently, every
`dispatch_agent` request returns the Phase-0 gate before registry resolution,
capacity/session allocation, worktree creation, spawn, or authority effects.

## Sources of truth

- Manifest authoring: the agent L2 repo (healthco template family)
- Skill profiles: engineering-core `skills/profiles.json` (generated, CI-checked)
- Future authorized execution: pi-autonomous-session-control (ASC), only after
  the AK 5132 contract lands; Phase 0 exposes no standing-agent execution
