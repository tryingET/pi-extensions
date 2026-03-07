---
summary: "Upstream proposal for vault_rate FK fallback behavior fix."
read_when:
  - "Submitting upstream issue to vault-client"
  - "Reviewing telemetry integration requirements"
system4d:
  container: "Cross-repo coordination artifact."
  compass: "Clear proposal, actionable acceptance criteria, minimal surface."
  engine: "Document problem -> propose solution -> define acceptance."
  fog: "Upstream maintainers may have different constraints; proposal is starting point."
---

# Upstream Proposal: vault_rate FK Fallback Behavior

## A) Proposal summary

When `vault_rate` is called without a prior execution record, it attempts a fallback insert with `execution_id = 0`, which fails due to FK constraints. The proposal is to either (a) create a placeholder execution record when rating without prior execution, or (b) make `execution_id` nullable and document "orphan feedback" semantics.

## B) Current behavior and limitation

### Current behavior:
```sql
-- vault-client rateTemplate() current behavior:
INSERT INTO feedback (execution_id, rating, notes, issues)
SELECT id, ${rating}, '${notes}', '${issues}'
FROM executions
WHERE entity_type = 'template' AND entity_id = ${template.id}
ORDER BY created_at DESC LIMIT 1;

-- If no execution found:
INSERT INTO feedback (execution_id, rating, notes, issues)
VALUES (0, ${rating}, '${notes}', '${issues}');  -- FK VIOLATION
```

### Limitation:
- FK constraint `feedback.execution_id → executions.id` rejects `execution_id = 0`
- User sees "Recorded rating X/5" but feedback is never persisted
- Silent data loss

### Current workaround and why it is fragile:
- Consumers must ensure an execution record exists before calling `vault_rate`
- This requires orchestration that may not be feasible in all workflows
- The workaround is external to vault-client and cannot be enforced

## C) Requested change

### Primary change:
Create a synthetic execution record when rating without prior execution:

```typescript
// Option A: Auto-create execution
const execId = await getOrCreateExecution(templateId, templateVersion);
await insertFeedback(execId, rating, notes, issues);
```

### Optional follow-up changes:
- Add `vault_rate` option `{ requireExecution: boolean }` to control strictness
- Add logging when synthetic execution is created

## D) Why this matters

### Developer impact:
- Feedback data is valuable for prompt quality loops
- Silent failures erode trust in telemetry

### Reliability/safety impact:
- Current behavior is a data integrity issue masquerading as success
- Users have no way to know their feedback was lost

### Ecosystem/tooling impact:
- Downstream orchestration tools (like pi-autonomous-session-control) cannot reliably rate prompts
- Cross-extension integration is hampered

## E) Proposed API shape

```typescript
// Option A: Auto-create execution (preferred)
interface RateTemplateOptions {
  templateName: string;
  variant?: string;
  rating: number;
  success: boolean;
  notes?: string;
  createExecutionIfMissing?: boolean; // default: true
}

function rateTemplate(options: RateTemplateOptions): Promise<{
  ok: boolean;
  message: string;
  executionId?: number;
  createdExecution?: boolean;
}>;

// Option B: Nullable execution_id (alternative)
// ALTER TABLE feedback MODIFY execution_id INT NULL;
// Document: NULL means "orphan feedback" (no linked execution)
```

## F) Compatibility and migration

### Backwards compatibility expectations:
- Existing calls work unchanged
- New behavior is additive (creates execution if missing)

### Migration path:
- Deploy schema migration (if Option B)
- Or deploy code change only (Option A)

### No-break guarantee scope:
- All existing `vault_rate` calls continue to return same response shape
- New `executionId` and `createdExecution` fields in response are additive

## G) Alternatives considered

### Alternative 1: Return error when no execution exists
- Pro: Explicit failure is clearer
- Con: Breaks existing workflows that expect "fire and forget" rating

### Alternative 2: Make execution_id nullable (Option B)
- Pro: Simple schema change
- Con: Orphan feedback has weaker analytics value

### Why the proposed approach is preferred:
- Option A preserves FK integrity and analytics value
- Auto-creating execution is semantically correct (user did "use" the template)
- Maintains "fire and forget" ergonomics

## H) Acceptance criteria

- [ ] `vault_rate` succeeds when no prior execution exists
- [ ] Response indicates whether execution was created
- [ ] FK constraint remains enforced (Option A)
- [ ] Documentation updated with new behavior
- [ ] Test coverage for rating-without-execution path

## I) Implementation sketch (maintainer-oriented)

### Discovery/parsing layer changes:
- None required

### API exposure changes:
- `rateTemplate()` in `extensions/vault.ts`:
  - Add `getOrCreateExecution()` helper
  - Modify INSERT to use returned execution_id

### Tests/docs updates:
- Add test: "rateTemplate creates execution when missing"
- Add test: "rateTemplate uses existing execution when present"
- Update README: document new `createExecutionIfMissing` option

## J) Copy-paste issue body

### What do you want to change?

The `vault_rate` tool silently fails when called without a prior execution record. The fallback `INSERT INTO feedback (execution_id, ...) VALUES (0, ...)` is rejected by the FK constraint, but the tool returns `{ ok: true }` to the caller.

**Proposed fix**: Auto-create a synthetic execution record when rating without prior execution, or make `execution_id` nullable with documented orphan semantics.

### Why?

- Silent data loss: User feedback is discarded without notification
- Cross-extension orchestration: Tools like `dispatch_subagent` cannot reliably rate prompts after use
- Quality feedback loop: Missing feedback degrades prompt improvement signals

### How?

```typescript
// In rateTemplate():
const execId = await getOrCreateExecution(template.id, template.version);
await db.insertFeedback(execId, rating, notes, issues);
return { ok: true, executionId: execId, createdExecution: !existingExecution };
```

The `getOrCreateExecution()` helper would:
1. Query for most recent execution for this template
2. If found, return its ID
3. If not found, INSERT a minimal execution record and return new ID

This preserves FK integrity while enabling "rate after use" workflows.
