/**
summary: "Tests the stable read-only provider API and verified Git worktree projection."
read_when:
  - "Changing the exported provider contract or git status parser."
*/
import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTEXT_PROVIDER_API_GLOBAL_SYMBOL,
  CONTEXT_PROVIDER_API_VERSION,
  collectVerifiedGitWorktreeState,
  createContextOmission,
  defineReadOnlyContextProvider,
  getGlobalContextProviderApi,
  installGlobalContextProviderApi,
  parseGitPorcelainV1Z,
  runReadOnlyContextProvider,
} from "../src/provider-api.js";

test("provider API bounds content and sanitizes omission details", async () => {
  const provider = defineReadOnlyContextProvider({
    id: "fixture",
    version: "v1",
    authority: "Fixture data only.",
    async collect() {
      return {
        items: [
          { id: "one", content: "x".repeat(80), provenance: { provider: "fixture" } },
          { id: "two", content: "second" },
        ],
        state: {
          branch: `sk-proj-${"S".repeat(32)}`,
          nested: { safe: true },
        },
        omissions: [
          createContextOmission({
            provider: "spoofed-provider",
            reason: "blocked",
            detail: "failed at /tmp/customer/token=secret-value-123456",
          }),
        ],
      };
    },
  });
  const result = await runReadOnlyContextProvider(
    provider,
    {},
    {
      limits: { maxItems: 1, maxItemChars: 20, maxTotalChars: 20 },
    },
  );
  assert.equal(result.apiVersion, CONTEXT_PROVIDER_API_VERSION);
  assert.equal(result.items.length, 1);
  assert.ok(result.items[0].content.length <= 20);
  assert.ok(result.omissions.length >= 2);
  assert.ok(result.omissions.every((omission) => omission.provider === "fixture"));
  assert.equal(result.state.branch, "[redacted credential]");
  assert.doesNotMatch(JSON.stringify(result), /customer|secret-value|sk-proj-/u);
  assert.match(result.nonAuthorization, /did not mutate/u);
});

test("git porcelain parser handles staged, unstaged, untracked, conflicts, and renames", () => {
  const parsed = parseGitPorcelainV1Z(
    [
      "M  src/staged.js",
      " M src/unstaged.js",
      "?? src/new.js",
      "UU src/conflict.js",
      "R  src/new-name.js",
      "src/old-name.js",
      " M .github/workflows/hidden.yml",
      "",
    ].join("\0"),
  );
  assert.equal(parsed.counts.staged, 2);
  assert.equal(parsed.counts.unstaged, 2);
  assert.equal(parsed.counts.untracked, 1);
  assert.equal(parsed.counts.conflicted, 1);
  assert.equal(parsed.counts.renamed, 1);
  assert.equal(parsed.changedPaths.at(-1).originalPath, "src/old-name.js");
  assert.equal(parsed.clean, false);
  assert.equal(parsed.omittedPathCount, 1);
});

test("verified Git provider exposes only repo-relative bounded metadata", async () => {
  const calls = [];
  const execFileAsync = async (_git, args) => {
    calls.push(args.join(" "));
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
      return { stdout: "/private/customer/repo\n" };
    }
    if (args[0] === "symbolic-ref") return { stdout: "main\n" };
    if (args[0] === "status") {
      return { stdout: " M packages/pi-session-compaction/src.js\0?? notes.txt\0" };
    }
    if (args[0] === "rev-parse" && args[1] === "--show-prefix") {
      return { stdout: "packages/pi-session-compaction/\n" };
    }
    throw new Error(`unexpected args ${args.join(" ")}`);
  };

  const result = await collectVerifiedGitWorktreeState(
    { cwd: "/private/customer/repo/packages/pi-session-compaction", maxPaths: 10 },
    { gitPath: "/usr/bin/git", execFileAsync },
  );
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.state.branch, "main");
  assert.equal(result.state.clean, false);
  assert.deepEqual(result.state.counts, {
    changed: 2,
    staged: 0,
    unstaged: 1,
    untracked: 1,
    conflicted: 0,
    renamed: 0,
  });
  assert.doesNotMatch(JSON.stringify(result), /private|customer/u);
  assert.ok(calls.every((call) => !/[;&|`$]/u.test(call)));
});

test("verified Git provider fails closed without a trusted executable", async () => {
  const result = await collectVerifiedGitWorktreeState(
    { cwd: "/repo" },
    {
      gitCandidates: [],
      stat: async () => {
        throw new Error("missing");
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.verified, false);
  assert.equal(result.omissions[0].reason, "unavailable");
});

test("verified Git provider redacts sensitive branch labels and omits sensitive paths", async () => {
  const secretBranch = `sk-proj-${"Z".repeat(32)}`;
  const result = await collectVerifiedGitWorktreeState(
    { cwd: "/repo", maxPaths: 10 },
    {
      gitPath: "/usr/bin/git",
      execFileAsync: async (_git, args) => {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return { stdout: "/repo\n" };
        if (args[0] === "symbolic-ref") return { stdout: `${secretBranch}\n` };
        if (args[0] === "status") {
          return { stdout: ` M safe.js\0?? token=supersecretvalue/file.txt\0` };
        }
        if (args[0] === "rev-parse" && args[1] === "--show-prefix") return { stdout: "" };
        throw new Error(`unexpected args ${args.join(" ")}`);
      },
    },
  );
  assert.equal(result.state.branch, "[redacted branch]");
  assert.deepEqual(
    result.state.changedPaths.map((entry) => entry.path),
    ["safe.js"],
  );
  assert.equal(result.state.omittedPathCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /sk-proj-|supersecretvalue/u);
});

test("provider runner preserves the declared provider identity and propagates abort", async () => {
  const provider = defineReadOnlyContextProvider({
    id: "fixture",
    version: "v1",
    async collect(_input, options) {
      options.signal?.throwIfAborted?.();
      return {
        items: [{ id: "one", content: "safe" }],
        omissions: [{ provider: "spoofed", reason: "blocked", detail: "safe detail" }],
      };
    },
  });
  const ok = await runReadOnlyContextProvider(provider);
  assert.equal(ok.provider, "fixture");
  assert.ok(ok.omissions.every((omission) => omission.provider === "fixture"));

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runReadOnlyContextProvider(provider, {}, { signal: controller.signal }),
    /abort/iu,
  );
});

test("provider API publishes a frozen versioned process-local surface", () => {
  const target = {};
  const surface = installGlobalContextProviderApi(target);
  assert.equal(surface.apiVersion, CONTEXT_PROVIDER_API_VERSION);
  assert.equal(Object.isFrozen(surface), true);
  assert.equal(target[CONTEXT_PROVIDER_API_GLOBAL_SYMBOL], surface);
  assert.equal(getGlobalContextProviderApi(target), surface);
  assert.equal(typeof surface.runReadOnlyContextProvider, "function");
  assert.equal("contextPack" in surface, false);
});
