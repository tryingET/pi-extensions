import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { withInspectionOutput } from "../src/adapters/inspection-output.ts";
import { createRocsCliPort } from "../src/adapters/rocs-cli.ts";
import { inspectOntology } from "../src/core/inspect.ts";
import { assessOntologyProposal } from "../src/core/proposal.ts";
import { RocsInspectionCleanupError } from "../src/ports/rocs-port.ts";
import { createSemanticPreflightRuntime } from "../src/semantic/preflight-runtime.ts";
import { createFakeWorkspacePort } from "./helpers.ts";

const prefix = ".pi-ontology-inspect-";

test("private output lifetime cleans success, consumer errors and concurrent operations", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "inspection-lifetime-"));
  t.after(() => rm(repo, { recursive: true }));
  const paths = new Set<string>();
  await Promise.all(
    [1, 2, 3].map(() =>
      withInspectionOutput(repo, async (root) => {
        paths.add(root);
        assert.equal((await lstat(root)).mode & 0o777, 0o700);
        await writeFile(path.join(root, "resolve.json"), "{}");
        await delay(5);
        assert.equal(await readFile(path.join(root, "resolve.json"), "utf8"), "{}");
      }),
    ),
  );
  assert.equal(paths.size, 3);
  const original = new Error("catalog read failed");
  await assert.rejects(
    withInspectionOutput(repo, async () => {
      throw original;
    }),
    (error) => error === original,
  );
  assert.deepEqual(await readdir(repo), []);
});

test("cleanup refuses replaced output ownership and preserves both failures", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "inspection-ownership-"));
  t.after(() => rm(repo, { recursive: true }));
  const foreign = path.join(repo, "foreign");
  await mkdir(foreign);
  await writeFile(path.join(foreign, "keep"), "untouched");
  for (const failOperation of [false, true]) {
    let allocated = "";
    const original = new Error("original operation failure");
    await assert.rejects(
      withInspectionOutput(repo, async (root) => {
        allocated = root;
        await rename(root, `${root}-moved`);
        await symlink(foreign, root);
        if (failOperation) throw original;
        return "must not report success";
      }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.match(error.message, /cleanup failed at/);
        assert.ok(error.message.includes(allocated));
        if (failOperation) assert.equal(error.errors[0], original);
        return true;
      },
    );
    assert.equal((await lstat(allocated)).isSymbolicLink(), true);
    assert.equal(await readFile(path.join(foreign, "keep"), "utf8"), "untouched");
  }
});

test("cleanup I/O failure is visible and preserves the operation error", async (t) => {
  assert.notEqual(process.getuid?.(), 0, "this permission-failure proof requires a non-root uid");
  const repo = await mkdtemp(path.join(tmpdir(), "inspection-cleanup-failure-"));
  let output = "";
  t.after(async () => {
    if (output) await chmod(output, 0o700);
    await rm(repo, { recursive: true });
  });
  const original = new Error("operation failed");
  await assert.rejects(
    withInspectionOutput(repo, async (root) => {
      output = root;
      await writeFile(path.join(root, "resolve.json"), "{}");
      await chmod(root, 0o500);
      throw original;
    }),
    (error) => {
      assert.ok(error instanceof RocsInspectionCleanupError);
      assert.equal(error.errors[0], original);
      assert.ok(["EACCES", "EPERM"].includes(error.errors[1]?.code));
      assert.ok(error.message.includes(output));
      return true;
    },
  );
});

test("legacy subprocess isolation fails closed and cleans error, abort and timeout paths", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "inspection-process-"));
  t.after(() => rm(repo, { recursive: true }));
  const script = path.join(repo, "runner.mjs");
  const ready = path.join(repo, "ready");
  // A process-boundary fixture, not a substitute for the separate real ROCS lane.
  await writeFile(
    script,
    `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = process.env.ROCS_OUTPUT_ROOT;
if (!root || !process.argv.includes('--no-index-cache')) throw Error('missing isolation');
if (process.env.ROCS_CACHE_DIR !== path.join(path.dirname(root), 'cache')) throw Error('missing cache isolation');
fs.mkdirSync(root, {recursive:true});
fs.mkdirSync(process.env.ROCS_CACHE_DIR, {recursive:true});
fs.writeFileSync(path.join(process.env.ROCS_CACHE_DIR, 'snapshot-fixture'), '{}');
fs.writeFileSync(path.join(root, 'authority-receipt.json'), '{}');
fs.writeFileSync(${JSON.stringify(ready)}, JSON.stringify({pid:process.pid, root, args:process.argv.slice(2)}));
switch (process.env.INSPECTION_TEST_MODE) {
  case 'fail': console.error('fixture ROCS failure'); process.exitCode=2; break;
  case 'parse': console.log('not json'); break;
  case 'flood': process.stdout.write('x'.repeat(9 * 1024 * 1024)); break;
  case 'wait': {
    const worker = spawn(process.execPath, ['-e', "setInterval(() => {}, 1000)"], {stdio:'inherit'});
    fs.writeFileSync(${JSON.stringify(ready)}, JSON.stringify({pid:process.pid, workerPid:worker.pid, root}));
    setInterval(() => {}, 1000);
    break;
  }
  default: console.log(JSON.stringify({layers:[],counts:{concepts:0,relations:0}}));
}
`,
  );
  await chmod(script, 0o700);
  const previous = { ...process.env };
  t.after(() => {
    process.env = previous;
  });
  process.env.PI_ONTOLOGY_ROCS_BIN = script;
  process.env.ROCS_OUTPUT_ROOT = path.join(repo, "ambient-output-must-not-be-used");
  const rocs = createRocsCliPort();
  const deps = { files: createFilesystemPort(), rocs, workspace: createFakeWorkspacePort(repo) };
  const status = () =>
    inspectOntology({ kind: "status", includeValidation: false }, { cwd: repo }, deps);
  const noScratch = async () =>
    assert.deepEqual(
      (await readdir(repo)).filter((name) => name.startsWith(prefix)),
      [],
    );
  for (const [mode, message] of [
    ["fail", /fixture ROCS failure/],
    ["parse", /failed to parse/],
    ["flood", /output limit exceeded/],
  ] as const) {
    process.env.INSPECTION_TEST_MODE = mode;
    await assert.rejects(status(), message);
    await noScratch();
  }
  process.env.INSPECTION_TEST_MODE = "ok";
  await status();
  const invocation = JSON.parse(await readFile(ready, "utf8"));
  assert.ok(invocation.root.startsWith(path.join(repo, prefix)));
  assert.ok(invocation.args.includes("loose"));
  assert.equal(process.env.ROCS_OUTPUT_ROOT, path.join(repo, "ambient-output-must-not-be-used"));
  await noScratch();

  process.env.INSPECTION_TEST_MODE = "wait";
  const preflight = createSemanticPreflightRuntime({ workspace: deps.workspace, legacyRocs: rocs });
  async function withCancelledInspection(consume: () => Promise<void>) {
    const controller = new AbortController();
    const access = preflight.inspectAccess(
      { cwd: repo } as never,
      { kind: "status" },
      controller.signal,
    );
    assert.equal(access.runtime.signal, controller.signal);
    const cancelled = assert.rejects(
      inspectOntology({ kind: "status" }, access.runtime, deps),
      /abort/i,
    );
    // Own the operation before readiness polling can throw. Cancellation uses its live
    // signal, never a saved PID; settlement includes child/stdio close and output cleanup.
    try {
      await consume();
    } finally {
      controller.abort();
      await cancelled;
    }
  }
  for (const failurePoint of ["none", "before readiness", "after readiness"] as const) {
    await t.test(`cancellation cleanup: ${failurePoint}`, async () => {
      await rm(ready, { force: true });
      let child: { pid: number; workerPid: number } | undefined;
      const original = new Error(`injected failure ${failurePoint}`);
      const operation = withCancelledInspection(async () => {
        if (failurePoint === "before readiness") throw original;
        // Synchronize with actual child execution, not a sleep-only proxy.
        for (let i = 0; i < 200; i++) {
          try {
            const candidate = JSON.parse(await readFile(ready, "utf8"));
            if (candidate.workerPid) {
              child = candidate;
              break;
            }
          } catch {
            await delay(10);
          }
        }
        assert.ok(child, "fixture must publish both owned processes");
        assert.equal(process.kill(child.pid, 0), true);
        assert.equal(process.kill(child.workerPid, 0), true);
        if (failurePoint === "after readiness") throw original;
      });
      if (failurePoint === "none") await operation;
      else await assert.rejects(operation, (error) => error === original);
      if (failurePoint !== "before readiness") assert.ok(child);
      if (child) {
        // Observations only: never signal these saved PIDs after cancellation settles.
        const { pid } = child;
        assert.throws(() => process.kill(pid, 0), /ESRCH/);
        if (process.platform === "linux") {
          // A killed orphan may briefly remain a zombie until init reaps it.
          try {
            let stat = "";
            for (let i = 0; i < 100; i++) {
              stat = await readFile(`/proc/${child.workerPid}/stat`, "utf8");
              if (/\) Z /.test(stat)) break;
              await delay(10);
            }
            assert.match(stat, /\) Z /);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
      }
      await noScratch();
    });
  }

  await assert.rejects(
    inspectOntology(
      { kind: "status" },
      {
        cwd: repo,
        semanticBoundary: {
          deadline: performance.now() + 100,
          signal: new AbortController().signal,
        },
      },
      deps,
    ),
    /deadline exceeded/,
  );
  await noScratch();
  await assert.rejects(
    inspectOntology({ kind: "status" }, { cwd: repo, signal: AbortSignal.abort() }, deps),
    /abort/i,
  );
  await noScratch();
  process.env.PI_ONTOLOGY_ROCS_BIN = path.join(repo, "missing-executable");
  await assert.rejects(status(), /ENOENT/);
  await noScratch();
  const cleanupFailure = new RocsInspectionCleanupError([], "cleanup failed");
  await assert.rejects(
    assessOntologyProposal(
      {
        candidateKind: "concept",
        title: "Probe",
        description: "A sufficiently shaped ontology concept.",
      },
      { cwd: repo },
      {
        ...deps,
        rocs: {
          ...rocs,
          withInspectionOutput: async () => {
            throw cleanupFailure;
          },
        },
      },
    ),
    (error) => error === cleanupFailure,
  );
  const { withInspectionOutput: _scope, ...unscoped } = rocs;
  await assert.rejects(
    inspectOntology({ kind: "search" }, { cwd: repo }, { ...deps, rocs: unscoped }),
    /capability required/,
  );
});
