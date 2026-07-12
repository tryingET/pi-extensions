---
description: Author a versioned pi-modes prompt profile with an explicit composition strategy
summary: "Author a versioned pi-modes prompt profile with an explicit composition strategy."
read_when:
  - "Invoking the packaged mode-authoring prompt template."
system4d:
  container: "Prompt-profile authoring helper."
  compass: "Make composition strategy and non-authorizations explicit."
  engine: "Interpret objective -> select strategy -> emit schemaVersion 1 JSON."
  fog: "Mode text can accidentally imply runtime authority or hidden continuation."
---

Design a `pi-modes` JSON profile for this objective:

{{args}}

Choose and explain exactly one strategy:

- `append`: preserve the assembled host prompt and add instructions;
- `replace_base`: replace the static base while retaining append/context/skills/date/cwd;
- `replace_final`: use the supplied prompt as the exact final prompt.

Return valid schemaVersion 1 JSON with `key`, `label`, `description`, `promptStrategy`, and `systemPrompt`. Do not add autonomous continuation, peer launch, campaign start, mutation permission, or promotion authority to the mode contract.
