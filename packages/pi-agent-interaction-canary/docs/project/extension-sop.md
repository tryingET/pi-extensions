---
summary: "Lifecycle SOP for the private Agent Interaction canary."
read_when:
  - "Planning, implementing, validating, or dogfooding this canary."
system4d:
  container: "Private injected-receipt-only Pi canary procedure."
  compass: "Preserve owner authority while testing a bounded Pi consumer."
  engine: "plan -> implement -> validate -> fresh-process proof -> record evidence."
  fog: "Local validation or handler entry can be mistaken for authentication or release readiness."
---

# Extension SOP

## Plan

- Bind work to an AK task with package-only scope.
- Preserve owner-native AK, ts-quality, and ROCS authority.
- Treat registered handler provenance as observation, not authentication.

## Implement

- Accept injected receipts only.
- Add no process/filesystem acquisition, writes, caches, evidence recording,
  session persistence, or memory.
- Keep compact and expansion bindings fail closed.

## Validate

- Run `npm test` and `npm run check`.
- Run structure validation and inspect the deterministic package allowlist.
- Recheck that extension behavior introduces no acquisition or persistence.

## Dogfood

- Install only the exact local package path under an authorized task.
- Start a fresh Pi process or reload, verify command and tool registration, and
  perform compact plus same-receipt expansion proof.
- Record bounded proof without claiming caller authentication or general compatibility.

## Release

Not available. This private package has no publication or release route.
`scripts/release-check.sh` fails closed.
