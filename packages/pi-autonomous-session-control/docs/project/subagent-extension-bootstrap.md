---
summary: "How explicit provider-extension sources satisfy numeric-alias subagent bootstrap."
read_when:
  - "Diagnosing extension_bootstrap_missing for a multi-pass child model."
  - "Dispatching an aliased provider from a fork or relocated multi-pass checkout."
---

# Provider-extension bootstrap

A child using a numeric provider alias such as `openai-codex-2` needs multi-pass loaded before model selection. Pass its installed entry explicitly:

```json
{
  "profile": "reviewer",
  "objective": "Review the scoped change",
  "extensions": ["/path/to/pi-multi-pass/extensions/multi-sub.ts"]
}
```

ASC recognizes the `extensions/multi-sub.ts` (or `.js`) entry of a package named `pi-multi-pass`, without evaluating its code. The checkout directory and GitHub owner need not match the original upstream installation. Relative paths resolve from the dispatch context's cwd; symlinked entries are inspected through their real path.

A recognized explicit source takes precedence over automatic multi-pass discovery. It satisfies both inferred numeric-alias bootstrap and an explicit `pi-multi-pass` / `multi-pass` alias, loading the same path only once. `PI_SUBAGENT_EXTENSIONS` paths follow the same rule. Missing explicit paths and unknown aliases still fail closed rather than being silently dropped. Other existing extension files remain valid requests, but cannot satisfy the required multi-pass identity.

`PI_MULTI_PASS_EXTENSION` remains the direct override for custom entry layouts; otherwise the legacy upstream checkout is the fallback. An arbitrary extension file or a file merely named `multi-sub.ts` does not establish package identity. Metadata recognition selects a bootstrap source; it is not a security audit or proof that the extension successfully registers the provider. Child startup remains responsible for that runtime check.

No automatic installation, credential migration, model request, or account switch is performed by source selection. Resolver tests and captured-spawner dispatch tests establish selection and failure behavior, not a completed live agent turn.
