/** Verify the actual active-entry projection and repeat behavior with real ripwire. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workingSetFromEntries } from "../src/code-working-set.js";
import { contextPacketToolResult } from "../src/context-pack.js";
export async function workingSetScenario() {
  const root = await mkdtemp(join(tmpdir(), "working-set-"));
  try {
    await writeFile(join(root, "a.ts"), "export function workingSetTarget() { return 42; }\n");
    const request = {
      objective: "Locate workingSetTarget",
      providers: { ripwire: "required", agents: "off", docs: "off", git: "off", session: "off" },
    };
    const first = await contextPacketToolResult(request, { cwd: root });
    assert.equal(first.details.ok, true);
    const workingSet = workingSetFromEntries([
      { type: "message", message: { role: "toolResult", toolName: "context_pack", ...first } },
    ]);
    assert.ok(workingSet.keys.length);
    const repeated = await contextPacketToolResult(request, { cwd: root, workingSet });
    assert.match(repeated.content[0].text, /Already loaded/);
    assert.ok(repeated.details.providerRuns.ripwire.duplicates > 0);
    const refresh = await contextPacketToolResult(
      { ...request, code: { mode: "discover", refresh: true } },
      { cwd: root, workingSet },
    );
    assert.doesNotMatch(refresh.content[0].text, /Already loaded/);
    const newSession = await contextPacketToolResult(request, {
      cwd: root,
      workingSet: workingSetFromEntries([]),
    });
    assert.doesNotMatch(newSession.content[0].text, /Already loaded/);
    await writeFile(join(root, "a.ts"), "export function workingSetTarget() { return 43; }\n");
    const changed = await contextPacketToolResult(request, { cwd: root, workingSet });
    assert.doesNotMatch(changed.content[0].text, /Already loaded/);
    return {
      gate: "RW-07",
      realBinary: true,
      repeatDeduped: true,
      refreshWorks: true,
      newSessionReservesContent: true,
      changedSourceReappears: true,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
