# Agent manifest convention v1 (AK 5098/5100)

A standing agent is declared by an `agent.json` at its agent-repo root. The
registry resolver (pi-agent-registry) maps the agent name to a composed
launch for dispatch_subagent / fork / candidate / scout spawners.

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

Fail-closed: unknown skill name, missing system-prompt file, unknown profile
key, or schema mismatch => resolution error, no spawn.

## Sources of truth

- Manifest authoring: the agent L2 repo (healthco template family)
- Skill profiles: engineering-core `skills/profiles.json` (generated, CI-checked)
- Execution: pi-autonomous-session-control subagent machinery (existing)
