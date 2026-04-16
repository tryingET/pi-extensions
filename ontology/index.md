---
summary: "Entry index for browsing pi-extensions repo-local ontology layers and generated artifacts."
read_when:
  - "You are navigating the pi-extensions ontology manually."
  - "You need quick pointers to manifest, system4d, bridge, and reference locations."
type: "reference"
---

# Ontology Index (repo)

Start here when browsing manually.

- `ontology/manifest.yaml` — which layers apply
- `ontology/src/system4d.yaml` — repo-local System4D for the monorepo root
- `ontology/src/reference/concepts/` — repo-local concepts (only when needed)
- `ontology/src/reference/relations/` — repo-local relation extensions (only when needed)
- `ontology/src/bridge/mapping.yaml` — map concepts to repo artifacts
- `ontology/dist/` — generated artifacts (tool-first)

Tip: Use `./scripts/rocs.sh pack <concept_id> --repo . --resolve-refs` instead of opening many files.
