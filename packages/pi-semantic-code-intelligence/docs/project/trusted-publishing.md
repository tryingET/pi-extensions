---
summary: "Why trusted publishing is intentionally disabled for this private local Pi package."
read_when:
  - "Reviewing release or publication posture for pi-semantic-code-intelligence."
system4d:
  container: "Private local package publication boundary."
  compass: "Keep Pi's SCI bridge aligned with SCI's local single-user candidate."
  engine: "Pack dry-run -> local install -> reload -> native-tool dogfood."
  fog: "Template publishing defaults can create false public-release posture."
---

# Trusted publishing is not active

This package deliberately uses:

- `private:true`;
- `x-pi-template.releaseConfigMode=none`;
- a package-local release check that performs artifact inspection only.

The package is installed into Pi from a reviewed local path. Neither `npm publish` nor `npm publish --dry-run` belongs in its required checks. The presence of template-required `publishConfig` metadata does not authorize or enable publication while `private:true` remains set.

A future registry release requires a separate accepted decision that also reconciles SCI's private local production-candidate boundary, package ownership, version compatibility, support posture, and rollback.
