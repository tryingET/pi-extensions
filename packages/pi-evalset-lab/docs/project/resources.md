---
summary: "Key resources for building and maintaining the extension."
read_when:
  - "Looking up references, docs, or operational artifacts."
system4d:
  container: "Reference catalog for the project."
  compass: "Centralize discovery paths for maintainers."
  engine: "Link docs, scripts, and examples used in execution."
  fog: "External links may become stale over time."
---

# Resources

- [Extension entrypoint](../../extensions/evalset.ts)
- [Prompt templates](../../prompts)
- [Smoke dataset](../../examples/fixed-task-set.json)
- [Larger dataset v2](../../examples/fixed-task-set-v2.json)
- [Recommended dataset v3](../../examples/fixed-task-set-v3.json)
- [Baseline system prompt](../../examples/system-baseline.txt)
- [Candidate system prompt](../../examples/system-candidate.txt)
- Local report artifacts path: `.evalset/reports/*.json` (and optional `*.html` exports)
- [JSON -> HTML export helper](../../scripts/export-evalset-report-html.mjs)
- [Project-local router extension](../../.pi/extensions/startup-intake-router.ts)
- [Organization operating model](../org/operating_model.md)
- [Interview questions (guided)](../org/project-docs-intake.questions.json)
- [Interview questions (minimal fallback)](../org/project-docs-intake.questions.minimal.json)
- [Runtime intake question builder](../../scripts/build-intake-questions-runtime.mjs)
- Startup intake completion marker (repo-local, ignored): `.pi/state/project-docs-intake.marker.json`
- [Security policy](../../policy/security-policy.json)
- [Validation script](../../scripts/validate-structure.sh)
