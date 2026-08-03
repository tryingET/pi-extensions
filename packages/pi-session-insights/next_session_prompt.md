# pi-session-insights handoff

Canonical task: AK-4625 in the pi-extensions monorepo.

Read first:

1. `AGENTS.md`
2. `README.md`
3. `docs/project/foundation.md`
4. `docs/project/session-analysis-sop.md`
5. `lib/session-insights.jq`
6. `tests/session-insights.test.mjs`

Current package posture is private, `releaseConfigMode=none`, skill-only, and not live-installed. Do not add an extension, prompt bundle, slash command, MCP, semantic ranking, or automatic KES promotion without a separately authorized follow-up.

Validate with:

```bash
npm run fixtures:test
npm run check
```
