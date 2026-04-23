---
name: pi-extensions-operator
description: Operate and reason about the pi-extensions monorepo, especially package-family ownership, standalone vs extra-stack packages, local extension install/reload workflow, and package selection before diving into a specific extension. Use after routing into pi-extensions or whenever the task is clearly about Pi extension package ownership or monorepo-level extension behavior.
---

# Pi Extensions Operator

## Purpose
Provide the correct read order, root/package boundary, and operator surface for work in `/home/tryinget/ai-society/softwareco/owned/pi-extensions`.

## Read order
1. `/home/tryinget/ai-society/softwareco/owned/pi-extensions/AGENTS.md`
2. `/home/tryinget/ai-society/softwareco/owned/pi-extensions/README.md`
3. `/home/tryinget/ai-society/softwareco/owned/pi-extensions/README.terse.md`
4. `/home/tryinget/ai-society/softwareco/owned/pi-extensions/docs/project/root-capabilities.md`
5. then the relevant package docs/AGENTS/manifests

## Root truth boundary
- The monorepo root owns shared validation, release/governance, compatibility canaries, and package-family structure.
- Package-local implementation details belong in the package that owns them.
- Do not answer a package-specific question from root docs alone; pivot to the relevant package after root selection.

## Package-family split
### Standalone-friendly entry points
- `pi-context-overlay`
- `pi-activity-strip`
- `pi-little-helpers`
- `pi-prompt-template-accelerator`
- `pi-interaction/*`
- `pi-autonomous-session-control`

### Extra-stack packages
- `pi-vault-client`
- `pi-ontology-workflows`
- `pi-society-orchestrator`

## Live activation rule
When a package change affects live Pi behavior:
1. install the actual package path with `pi install /absolute/path/...`
2. reload Pi with `/reload`
3. verify via a real command/tool call

## Use this skill for
- choosing the right package before deeper inspection
- monorepo root vs package-local responsibility questions
- extension install/reload workflow
- compatibility-canary and root validation surfaces
- deciding whether a concern belongs here vs Prompt Vault / ontology / society repos
