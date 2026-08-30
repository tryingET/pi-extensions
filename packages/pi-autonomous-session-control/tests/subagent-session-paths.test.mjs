import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getPiNativeSessionDirForCwd,
  resolvePiAgentDir,
  resolveSubagentSessionsDir,
} from "../extensions/self/subagent-session-paths.ts";

async function withTemporaryEnv(overrides, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("getPiNativeSessionDirForCwd mirrors Pi's encoded cwd session directory", () => {
  assert.equal(
    getPiNativeSessionDirForCwd("/tmp/example:repo", { agentDir: "/agent" }),
    "/agent/sessions/--tmp-example-repo--",
  );
});

test("public path resolution honors the Pi agent-dir environment without host imports", async () => {
  await withTemporaryEnv({ PI_CODING_AGENT_DIR: "~/custom-pi-agent" }, async () => {
    assert.equal(resolvePiAgentDir(), join(homedir(), "custom-pi-agent"));
    assert.equal(
      getPiNativeSessionDirForCwd("/work/repo"),
      join(homedir(), "custom-pi-agent", "sessions", "--work-repo--"),
    );
  });
});

test("resolveSubagentSessionsDir defaults below the Pi native session tree", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "asc-native-agent-dir-"));

  try {
    await withTemporaryEnv(
      {
        PI_SUBAGENT_SESSIONS_DIR: undefined,
        PI_CODING_AGENT_SESSION_DIR: undefined,
      },
      async () => {
        const resolved = resolveSubagentSessionsDir({ cwd: "/work/repo", agentDir });
        assert.equal(resolved.source, "pi-native");
        assert.equal(resolved.path, join(agentDir, "sessions", "--work-repo--", "asc-subagents"));
      },
    );
  } finally {
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("resolveSubagentSessionsDir keeps explicit ASC overrides", async () => {
  const explicitDir = await mkdtemp(join(tmpdir(), "asc-explicit-sessions-"));

  try {
    await withTemporaryEnv({ PI_SUBAGENT_SESSIONS_DIR: undefined }, async () => {
      const resolved = resolveSubagentSessionsDir({ explicitDir });
      assert.equal(resolved.source, "explicit");
      assert.equal(resolved.path, explicitDir);
    });
  } finally {
    await rm(explicitDir, { recursive: true, force: true });
  }
});
