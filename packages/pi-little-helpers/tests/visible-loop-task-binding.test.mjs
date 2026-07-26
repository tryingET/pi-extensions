// summary: verifies read-only AK task admission for task-bound visible and Nexus loops.
// read_when:
//   - changing task identity, repo, deferral, lease, or ready-queue admission checks.
import assert from "node:assert/strict";
import test from "node:test";

import { checkAkTaskExecutionBinding } from "../src/visibleLoopTaskBinding.ts";

function execFrom(task, ready = []) {
  return async (_command, args) => {
    if (args[1] === "show") {
      return { code: 0, stdout: JSON.stringify(task), stderr: "" };
    }
    if (args[1] === "ready") {
      return { code: 0, stdout: JSON.stringify(ready), stderr: "" };
    }
    throw new Error(`unexpected args: ${args.join(" ")}`);
  };
}

test("AK task execution binding admits only current-repo ready or live-claimed work", async () => {
  assert.equal(
    await checkAkTaskExecutionBinding(
      execFrom({ id: 4187, repo: "/repo", status: "pending", active_deferral: null }, [
        { id: 4187 },
      ]),
      "/repo/package",
      4187,
    ),
    undefined,
  );

  assert.equal(
    await checkAkTaskExecutionBinding(
      execFrom({
        id: 4187,
        repo: "/repo",
        status: "claimed",
        active_deferral: null,
        lease_expires_at: "2099-01-01T00:00:00Z",
      }),
      "/repo",
      4187,
    ),
    undefined,
  );
});

test("AK task execution binding rejects stale, deferred, cross-repo, and malformed work", async () => {
  const cases = [
    {
      name: "identity mismatch",
      task: { id: 7, repo: "/repo", status: "pending" },
      ready: [{ id: 4187 }],
      expected: /identity did not match/,
    },
    {
      name: "cross repo",
      task: { id: 4187, repo: "/other", status: "pending" },
      ready: [{ id: 4187 }],
      expected: /another repository/,
    },
    {
      name: "deferred",
      task: {
        id: 4187,
        repo: "/repo",
        status: "pending",
        active_deferral: { kind: "until_decision" },
      },
      ready: [{ id: 4187 }],
      expected: /actively deferred/,
    },
    {
      name: "done",
      task: { id: 4187, repo: "/repo", status: "done" },
      ready: [],
      expected: /not pending or claimed/,
    },
    {
      name: "missing lease",
      task: { id: 4187, repo: "/repo", status: "claimed" },
      ready: [],
      expected: /no claim lease/,
    },
    {
      name: "expired lease",
      task: {
        id: 4187,
        repo: "/repo",
        status: "claimed",
        lease_expires_at: "2000-01-01T00:00:00Z",
      },
      ready: [],
      expected: /invalid or expired claim lease/,
    },
    {
      name: "not ready",
      task: { id: 4187, repo: "/repo", status: "pending" },
      ready: [],
      expected: /is not ready/,
    },
  ];

  for (const entry of cases) {
    const result = await checkAkTaskExecutionBinding(
      execFrom(entry.task, entry.ready),
      "/repo",
      4187,
    );
    assert.match(result, entry.expected, entry.name);
  }

  const invalidJson = await checkAkTaskExecutionBinding(
    async () => ({ code: 0, stdout: "not-json", stderr: "" }),
    "/repo",
    4187,
  );
  assert.match(invalidJson, /invalid JSON/);
});

test("AK task execution binding rejects killed readback and readiness commands", async () => {
  const task = { id: 4187, repo: "/repo", status: "pending", active_deferral: null };
  const killedReadback = await checkAkTaskExecutionBinding(
    async () => ({ code: 0, killed: true, stdout: JSON.stringify(task), stderr: "" }),
    "/repo",
    4187,
  );
  assert.match(killedReadback, /could not be read/);

  const killedReadiness = await checkAkTaskExecutionBinding(
    async (_command, args) =>
      args[1] === "show"
        ? { code: 0, stdout: JSON.stringify(task), stderr: "" }
        : { code: 0, killed: true, stdout: JSON.stringify([{ id: 4187 }]), stderr: "" },
    "/repo",
    4187,
  );
  assert.match(killedReadiness, /readiness could not be verified/);
});
