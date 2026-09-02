// summary: proves visible children retain explicit parent company provenance without cross-company guessing.
import assert from "node:assert/strict";
import test from "node:test";
import {
  prefixPiArgsWithCompanyContext,
  resolveChildCompanyContext,
} from "../src/companyContextProvenance.ts";

test("isolated state worktrees inherit explicit known parent company provenance", () => {
  const provenance = resolveChildCompanyContext({
    env: {},
    targetCwd: "/home/user/.local/state/pi-quests/worktrees/pi-supervision-ux",
    parentCwd: "/home/user/ai-society/softwareco/owned/pi-extensions",
  });
  assert.deepEqual(provenance, {
    company: "software",
    source: "parent_cwd",
    sourceCwd: "/home/user/ai-society/softwareco/owned/pi-extensions",
  });
  assert.deepEqual(prefixPiArgsWithCompanyContext(["pi", "prompt"], provenance), [
    "env",
    "PI_COMPANY=software",
    "PI_COMPANY_PROVENANCE=parent_cwd",
    "PI_COMPANY_SOURCE_CWD=/home/user/ai-society/softwareco/owned/pi-extensions",
    "pi",
    "prompt",
  ]);
});

test("target company provenance wins over a different parent and unknown ancestry stays unknown", () => {
  assert.deepEqual(
    resolveChildCompanyContext({
      env: {},
      targetCwd: "/srv/ai-society/financeco/owned/book",
      parentCwd: "/srv/ai-society/softwareco/owned/pi-extensions",
    }),
    {
      company: "finance",
      source: "target_cwd",
      sourceCwd: "/srv/ai-society/financeco/owned/book",
    },
  );
  assert.equal(
    resolveChildCompanyContext({
      env: {},
      targetCwd: "/home/user/.local/state/unrelated",
      parentCwd: "/home/user/src/unscoped",
    }),
    undefined,
  );
});

test("explicit environment provenance is preserved but malformed values are not injected", () => {
  assert.deepEqual(
    resolveChildCompanyContext({
      env: { PI_COMPANY: "software" },
      targetCwd: "/srv/ai-society/financeco/owned/book",
    }),
    { company: "software", source: "environment" },
  );
  assert.equal(
    resolveChildCompanyContext({
      env: { PI_COMPANY: "software;unsafe" },
      targetCwd: "/unscoped",
    }),
    undefined,
  );
});
