// ---
// summary: "Tests Starship-style Git footer parsing, formatting, and refresh behavior."
// read_when:
//   - "Changing runtime footer Git branch or working-tree status behavior."
// ---

import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitFooterRefreshState,
  disposeGitFooterRefresh,
  formatGitFooterStatus,
  formatGitStatusSymbols,
  invalidateGitFooterRefresh,
  parseGitStatusPorcelainV2,
  refreshGitFooterStatus,
} from "../src/runtime/git-footer-status.ts";

const DIRTY_STATUS = [
  "# branch.oid 0123456789abcdef",
  "# branch.head feature/footer",
  "# branch.upstream origin/feature/footer",
  "# branch.ab +2 -1",
  "# stash 3",
  "u UU N... 100644 100644 100644 100644 a b c conflict.txt",
  "1 .D N... 100644 100644 000000 a a a deleted.txt",
  "1 .M N... 100644 100644 100644 a a a modified.txt",
  "2 R. N... 100644 100644 100644 a a a R100 moved.txt\toriginal.txt",
  "1 M. N... 100644 100644 100644 a b b staged.txt",
  "? untracked.txt",
  "",
].join("\n");

test("Git footer parses porcelain v2 and matches the configured Starship-style symbols", () => {
  const summary = parseGitStatusPorcelainV2(DIRTY_STATUS);

  assert.deepEqual(summary, {
    branch: "feature/footer",
    hasUpstream: true,
    ahead: 2,
    behind: 1,
    conflicted: 1,
    stashed: 3,
    deleted: 1,
    renamed: 1,
    modified: 1,
    staged: 1,
    untracked: 1,
  });
  assert.equal(formatGitStatusSymbols(summary), "🏳📦🗑👅📝++(1)🤷⇕⇡2⇣1");
  assert.equal(formatGitFooterStatus(undefined, summary), "🌱 feature/footer 🏳📦🗑👅📝++(1)🤷⇕⇡2⇣1");
});

test("Git footer shows upstream clean, ahead, and behind state without inventing status", () => {
  const clean = parseGitStatusPorcelainV2(
    ["# branch.head main", "# branch.upstream origin/main", "# branch.ab +0 -0", ""].join("\n"),
  );
  assert.equal(formatGitFooterStatus("main", clean), "🌱 main ✓");

  const ahead = { ...clean, ahead: 4 };
  assert.equal(formatGitFooterStatus("main", ahead), "🌱 main ⇡4");

  const behind = { ...clean, behind: 2 };
  assert.equal(formatGitFooterStatus("main", behind), "🌱 main ⇣2");
  assert.equal(formatGitFooterStatus(null, undefined), undefined);
});

test("Git footer refresh is lazy, throttled, invalidatable, and disposable", async () => {
  const state = createGitFooterRefreshState();
  let calls = 0;
  let changes = 0;
  const exec = async () => {
    calls += 1;
    return { stdout: DIRTY_STATUS, code: 0 };
  };

  refreshGitFooterStatus(state, {
    cwd: "/repo",
    exec,
    onChange: () => {
      changes += 1;
    },
    now: 10_000,
  });
  await state.probeInFlight;
  assert.equal(calls, 1);
  assert.equal(changes, 1);
  assert.equal(state.latest?.ahead, 2);

  refreshGitFooterStatus(state, { cwd: "/repo", exec, now: 10_100 });
  assert.equal(calls, 1);

  invalidateGitFooterRefresh(state);
  refreshGitFooterStatus(state, { cwd: "/repo", exec, now: 10_100 });
  await state.probeInFlight;
  assert.equal(calls, 2);

  disposeGitFooterRefresh(state);
  invalidateGitFooterRefresh(state);
  refreshGitFooterStatus(state, { cwd: "/repo", exec, now: 20_000 });
  assert.equal(calls, 2);
});

test("Git footer schedules a wake-up when a render lands inside the refresh throttle", async () => {
  const state = createGitFooterRefreshState();
  state.lastProbeAt = Date.now();
  let calls = 0;
  let wakeUps = 0;
  const exec = async () => {
    calls += 1;
    return { stdout: DIRTY_STATUS, code: 0 };
  };
  const onChange = () => {
    wakeUps += 1;
    if (calls === 0) {
      refreshGitFooterStatus(state, { cwd: "/repo", exec, onChange, refreshMs: 10 });
    }
  };

  refreshGitFooterStatus(state, { cwd: "/repo", exec, onChange, refreshMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  if (state.probeInFlight) await state.probeInFlight;

  assert.equal(calls, 1);
  assert.ok(wakeUps >= 1);
  assert.equal(state.latest?.branch, "feature/footer");
  disposeGitFooterRefresh(state);
});

test("Git footer rate-limits a render requested while a probe is in flight", async () => {
  let resolveProbe;
  const probeResult = new Promise((resolve) => {
    resolveProbe = resolve;
  });
  let calls = 0;
  const exec = async () => {
    calls += 1;
    return probeResult;
  };
  const state = createGitFooterRefreshState();

  refreshGitFooterStatus(state, { cwd: "/repo", exec, onChange: () => {}, refreshMs: 50 });
  const probe = state.probeInFlight;
  refreshGitFooterStatus(state, { cwd: "/repo", exec, onChange: () => {}, refreshMs: 50 });
  resolveProbe({ stdout: DIRTY_STATUS, code: 0 });
  await probe;
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(calls, 1);
  assert.ok(state.refreshTimer, "expected a rate-limited follow-up wake-up");
  disposeGitFooterRefresh(state);
});

test("Git footer discards an in-flight result after branch invalidation and refreshes again", async () => {
  const oldStatus = [
    "# branch.head old",
    "# branch.upstream origin/old",
    "# branch.ab +7 -0",
    "",
  ].join("\n");
  const newStatus = [
    "# branch.head new",
    "# branch.upstream origin/new",
    "# branch.ab +0 -2",
    "",
  ].join("\n");
  let resolveFirst;
  const firstResult = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  let calls = 0;
  const exec = async () => {
    calls += 1;
    if (calls === 1) return firstResult;
    return { stdout: newStatus, code: 0 };
  };

  const state = createGitFooterRefreshState();
  state.latest = parseGitStatusPorcelainV2(oldStatus);
  const onChange = () => {
    if (!state.latest) {
      refreshGitFooterStatus(state, { cwd: "/repo", exec, onChange, refreshMs: 0 });
    }
  };

  refreshGitFooterStatus(state, { cwd: "/repo", exec, onChange, refreshMs: 0 });
  const staleProbe = state.probeInFlight;
  invalidateGitFooterRefresh(state);
  refreshGitFooterStatus(state, { cwd: "/repo", exec, onChange, refreshMs: 0 });
  resolveFirst({ stdout: oldStatus, code: 0 });
  await staleProbe;
  while (state.probeInFlight) await state.probeInFlight;

  assert.equal(calls, 2);
  assert.equal(state.latest?.branch, "new");
  assert.equal(state.latest?.ahead, 0);
  assert.equal(state.latest?.behind, 2);
  disposeGitFooterRefresh(state);
});
