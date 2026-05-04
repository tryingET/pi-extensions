---
summary: "Compatibility redirect: pi-autoresearch package alignment now lives in product-posture.md."
read_when:
  - "You followed an older current-vs-target.md link."
  - "You need the current package-level alignment anchor for pi-autoresearch."
type: "redirect"
system4d:
  container: "Compatibility shim for older pi-autoresearch status links."
  compass: "Route new work to product posture instead of preserving a second package-alignment authority."
  engine: "Redirect old link -> name current anchor -> keep historical links from breaking."
  fog: "The risk is letting current-vs-target continue as a parallel planning document after product posture becomes authoritative."
---

# Redirect — current-vs-target has been replaced

`current-vs-target.md` is no longer the package-level alignment anchor for `@tryinget/pi-autoresearch`.

Use:

- [vision.md](./vision.md) for the package north star / final end-state direction
- [product-posture.md](./product-posture.md) for current product promise, maturity, trust gates, boundaries, strategic line, and next product bets

## Why this file remains

Older status, ADR, and contract documents link here as historical closure evidence. This shim keeps those links truthful without preserving a second live planning authority.

## Current external follow-on pointer

The manifest-campaign supervision follow-on above this package is tracked outside this redirect:

- [product-posture.md](./product-posture.md) for package posture and ownership boundaries
- [pi-autoresearch manifest campaign supervision status](../../../pi-society-orchestrator/docs/project/pi-autoresearch-manifest-campaign-supervision-status.md) for the landed orchestrator-side one-shot observation / evidence-only AK projection proof

## Rule for new work

Do not add new status truth here. Update `vision.md` for north-star direction, `product-posture.md` for current posture, or a narrower status/ADR/evidence note instead.
