---
summary: "Upstream proposal for structured JSON output from vault-client tools."
read_when:
  - "Submitting upstream issue to vault-client"
  - "Designing cross-extension integration contracts"
system4d:
  container: "Cross-repo coordination artifact."
  compass: "Clear proposal, backwards compatible, type-safe contract."
  engine: "Document problem -> propose solution -> define migration path."
  fog: "Upstream maintainers may prefer different approach; proposal is starting point."
---

# Upstream Proposal: Structured JSON Output from vault-client Tools

## A) Proposal summary

vault-client tools (`vault_query`, `vault_retrieve`, `vault_rate`) currently return human-readable text output. This proposal adds an optional `format: "json"` parameter to return structured JSON, enabling reliable programmatic consumption and cross-extension integration.

## B) Current behavior and limitation

### Current behavior:
```typescript
// vault_retrieve returns text:
{
  content: [{ type: "text", text: "# Retrieved Templates (1)\n\n## nexus\n..." }]
}

// Consumers must parse text to extract fields:
const name = output.match(/^##\s+([^\n]+?)\s*$/m)?.[1];
const content = output.split("\n---\n")[1];
```

### Limitation:
- Text output format is undocumented and subject to change
- Parsing is fragile: markdown separators, whitespace, edge cases
- ESM module resolution prevents cross-extension testing in CI
- Integration coupling is implicit and brittle

### Current workaround and why it is fragile:
- Each consumer implements their own parser
- `cross-extension-harness.ts` has 60+ lines of parsing logic
- Format changes break all consumers silently

## C) Requested change

### Primary change:
Add `format` parameter to vault-client tools:

```typescript
vault_query({ keywords: [...], format: "json" })
// Returns: { templates: [{ name, type, tags, description }] }

vault_retrieve({ names: [...], format: "json" })
// Returns: { templates: [{ name, type, tags, content }] }
```

### Optional follow-up changes:
- Add JSON schema for each tool's response
- Add `include_content` option to `vault_query` for single-call retrieval
- Add TypeScript types export from vault-client

## D) Why this matters

### Developer impact:
- Reliable cross-extension integration
- Type-safe consumption of vault data
- Reduced boilerplate in consumer code

### Reliability/safety impact:
- Format changes are caught at compile time (TypeScript)
- No silent parsing failures
- Testable without ESM runtime context

### Ecosystem/tooling impact:
- Enables CI testing of cross-extension flows
- Reduces coupling surface to documented JSON schema
- Allows independent evolution of rendering vs data layer

## E) Proposed API shape

```typescript
// Types
interface VaultTemplate {
  name: string;
  type: "cognitive" | "task" | "session";
  tags: string[];
  description?: string;
  content?: string;
  variables?: string[];
}

interface VaultQueryResult {
  ok: boolean;
  templates: VaultTemplate[];
  query: { keywords?: string[]; tags?: string[]; limit: number };
}

interface VaultRetrieveResult {
  ok: boolean;
  templates: VaultTemplate[];
}

// Tool parameters
vault_query({
  keywords?: string[];
  tags?: string[];
  limit?: number;
  include_content?: boolean;
  format?: "text" | "json"; // default: "text" for backwards compat
});

vault_retrieve({
  names: string[];
  include_content?: boolean;
  format?: "text" | "json"; // default: "text"
});

// Tool response (when format: "json")
{
  content: [{ type: "text", text: JSON.stringify({ ok: true, templates: [...] }) }],
  details: { ok: true, format: "json" }
}
```

## F) Compatibility and migration

### Backwards compatibility expectations:
- Default `format: "text"` preserves current behavior
- Existing calls unchanged

### Migration path:
1. Add `format` parameter with default "text"
2. Export TypeScript types from vault-client
3. Consumers opt-in to JSON format
4. (Optional) Deprecate text format in future major version

### No-break guarantee scope:
- All existing calls work unchanged
- Only new `format: "json"` calls get structured output

## G) Alternatives considered

### Alternative 1: Separate programmatic API
- Add `vaultQueryJson()` internal function
- Con: Duplicates logic, harder to maintain

### Alternative 2: Return JSON in `details` field
- Keep text in `content`, add parsed data in `details`
- Con: Redundant data, larger responses

### Alternative 3: Export parser functions
- Keep text format, export `parseVaultQueryOutput()`
- Con: Still fragile, just moves parsing upstream

### Why the proposed approach is preferred:
- Single source of truth for output format
- Type-safe from vault-client to consumer
- Clean separation of data vs rendering
- Enables future improvements (streaming, pagination)

## H) Acceptance criteria

- [ ] `vault_query({ format: "json" })` returns structured JSON
- [ ] `vault_retrieve({ format: "json" })` returns structured JSON
- [ ] TypeScript types exported from vault-client package
- [ ] Backwards compatible (default format: "text")
- [ ] Documentation updated with JSON format examples
- [ ] Test coverage for JSON output path

## I) Implementation sketch (maintainer-oriented)

### Discovery/parsing layer changes:
- Extract template formatting into separate functions
- Add `formatTemplateList(templates, format)` helper
- Add `formatTemplateDetail(template, format)` helper

### API exposure changes:
- Add `format` to tool parameter schemas
- Branch output based on format in `execute()`:
  ```typescript
  if (params.format === "json") {
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, templates }) }],
      details: { ok: true, format: "json" }
    };
  }
  // existing text format logic
  ```

### Tests/docs updates:
- Add tests: "vault_query returns JSON when format=json"
- Add tests: "vault_retrieve returns JSON when format=json"
- Document JSON response schema in README
- Add TypeScript types to exports

## J) Copy-paste issue body

### What do you want to change?

Add an optional `format: "json"` parameter to vault-client tools (`vault_query`, `vault_retrieve`) to return structured JSON instead of human-readable text.

### Why?

Current text output requires fragile parsing:
- Each consumer implements custom parsing logic
- Format changes break consumers silently
- Cross-extension testing is blocked by ESM resolution issues
- No type safety for programmatic consumption

### How?

```typescript
// Add format parameter (default: "text")
vault_retrieve({ names: ["nexus"], include_content: true, format: "json" })

// Returns structured JSON in content[0].text:
{
  ok: true,
  templates: [{
    name: "nexus",
    type: "cognitive",
    tags: ["action:reduce", "phase:hypothesis"],
    content: "NEXUS — The Single Highest-Leverage Intervention\n..."
  }]
}

// Export TypeScript types
export interface VaultTemplate {
  name: string;
  type: "cognitive" | "task" | "session";
  tags: string[];
  content?: string;
}
```

This enables:
- Type-safe consumption from other extensions
- Reliable CI testing without runtime context
- Documented contract between vault-client and consumers
