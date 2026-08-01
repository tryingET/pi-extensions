---
summary: "Product and technical vision for pi-code-mode."
read_when:
  - "Defining or revisiting code-mode direction."
system4d:
  container: "One-call local program execution for Pi."
  compass: "Reduce repetitive tool-call overhead without bypassing owner runtimes or hiding execution authority."
  engine: "Prove bounded code aggregation -> measure -> add explicit owner adapters -> reassess host seam."
  fog: "Feature pressure can turn an explicit registry into an ungoverned universal dispatcher."
---

# Vision

Give Pi agents a concise, inspectable way to replace repetitive model-issued operations with one bounded Python or JavaScript program.

The package should:

- remain extension-only while the useful capability can be owned outside Pi core;
- compose ASC, orchestrator, and other owned runtimes through explicit public adapters;
- make arbitrary-code authority and non-sandbox status unavoidable to operators;
- preserve one-call aggregation without claiming nested calls are ordinary Pi tool calls;
- use dogfood evidence before deactivating or replacing model-facing Bash.

Universal invocation of arbitrary registered Pi tools is outside the current package boundary. If proven necessary, it should be proposed against the upstream AgentHarness/extension-host design.
