import childProcess from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

let activeFixture = false;

function groupIsGone(pid) {
  try {
    process.kill(-pid, 0);
    return false;
  } catch (error) {
    if (error.code === "ESRCH") return true;
    throw error; // Permission/inspection failures are not quiescence.
  }
}

function captureGroups(record) {
  if (record.exited || !record.helper.pid) return;
  let children;
  try {
    children = readFileSync(
      `/proc/${record.helper.pid}/task/${record.helper.pid}/children`,
      "utf8",
    );
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ESRCH") record.inspectionError = error;
    return;
  }
  for (const pid of children.trim().split(/\s+/).filter(Boolean).map(Number)) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat
        .slice(stat.lastIndexOf(")") + 1)
        .trim()
        .split(/\s+/);
      // Only detached, directly owned supervisor leaders; never signal a sampled PGID.
      if (Number(fields[1]) === record.helper.pid && Number(fields[2]) === pid)
        record.groups.add(pid);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ESRCH") record.inspectionError = error;
    }
  }
}

// Tee only the bounded protocol prefix at ingress, before native buffering/data
// delivery. Never read/resume here: unread-stdout fixtures must retain backpressure.
function captureTransportCustody(record) {
  const stdout = record.helper.stdout;
  if (!stdout) return;
  const nativePush = stdout.push;
  let prefix = "";
  let remaining = 64 * 1024;
  let finished = false;
  stdout.push = function (chunk, ...args) {
    if (!finished && chunk !== null) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      prefix += bytes.subarray(0, remaining).toString("utf8");
      remaining -= Math.min(bytes.length, remaining);
      while (!finished) {
        const newline = prefix.indexOf("\n");
        if (newline === -1) break;
        const line = prefix.slice(0, newline);
        prefix = prefix.slice(newline + 1);
        try {
          const event = JSON.parse(line);
          if (event.type !== "transport_ready") continue;
          finished = true;
          // Small production event limits legitimately omit the custody extension.
          // Such a handshake is not durable proof; retain /proc fallback only.
          if (
            event.rawChildPidStartedAt === undefined ||
            event.rawChildProcessGroupId === undefined
          )
            continue;
          if (
            !Number.isSafeInteger(event.rawChildPid) ||
            event.rawChildPid <= 0 ||
            !Number.isSafeInteger(event.rawChildPidStartedAt) ||
            event.rawChildPidStartedAt < 0 ||
            event.rawChildProcessGroupId !== event.rawChildPid
          ) {
            record.inspectionError = new Error("Invalid transport_ready fixture custody");
            continue;
          }
          // The owned helper reports its detached supervisor, not the raw Pi PID.
          record.custody = Object.freeze({
            rawChildPid: event.rawChildPid,
            rawChildPidStartedAt: event.rawChildPidStartedAt,
            rawChildProcessGroupId: event.rawChildProcessGroupId,
          });
          record.groups.add(event.rawChildProcessGroupId);
        } catch {
          // Other protocol lines are not custody; /proc remains supplemental.
        }
      }
      if (remaining === 0) finished = true;
      if (finished) prefix = "";
    }
    return nativePush.call(this, chunk, ...args);
  };
}

async function stopFixtureHelpers(records) {
  const forceKills = [];
  try {
    for (const record of records) {
      captureGroups(record);
      if (record.closed) continue;
      record.helper.stdout?.resume();
      record.helper.stderr?.resume();
      record.helper.kill("SIGTERM");
      forceKills.push(
        setTimeout(() => {
          captureGroups(record);
          if (!record.closed) record.helper.kill("SIGKILL");
        }, 500),
      );
    }
    // Reuse the existing supervisor group's four-second quiescence bound.
    const deadline = Date.now() + 4_000;
    while (true) {
      for (const record of records) captureGroups(record);
      const complete = records.every(
        (record) => record.closed && [...record.groups].every(groupIsGone),
      );
      if (complete) {
        const uncertain = records.find(
          (record) => record.inspectionError || record.groups.size === 0,
        );
        if (uncertain)
          throw new Error("Cannot prove raw-group custody/quiescence for every helper");
        return;
      }
      if (Date.now() >= deadline)
        throw new Error("Helper closure/raw-group quiescence unconfirmed");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    for (const timer of forceKills) clearTimeout(timer);
  }
}

export async function withFakePiOnPath(scriptBody, run, version = "0.80.6") {
  if (activeFixture) throw new Error("Transport fixtures must not overlap in one process");
  activeFixture = true;
  let tempDir;
  const records = [];
  const nativeSpawn = childProcess.spawn;
  let monitor;
  let preserve = false;
  try {
    tempDir = await mkdtemp(join(tmpdir(), "subagent-transport-live-fake-pi-"));
    const binDir = join(tempDir, "bin");
    const agentDir = join(tempDir, "private-agent");
    const scratchDir = join(tempDir, "scratch");
    await mkdir(binDir, { mode: 0o700 });
    await mkdir(agentDir, { mode: 0o700 });
    await mkdir(scratchDir, { mode: 0o700 });
    // Explicit CJS for require-based scripts, including TMPDIR inside an ESM repo.
    const scenarioPath = join(binDir, "pi-scenario.cjs");
    await writeFile(scenarioPath, scriptBody, { mode: 0o700 });
    await writeFile(
      join(binDir, "pi"),
      `#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then printf '%s\\n' ${JSON.stringify(version)}; exit 0; fi\nexec ${JSON.stringify(scenarioPath)} "$@"\n`,
      { mode: 0o700 },
    );

    return await withTemporaryEnv(
      {
        PATH: `${binDir}:${process.env.PATH || ""}`,
        PI_CODING_AGENT_DIR: agentDir,
        TMPDIR: scratchDir,
        NODE_COMPILE_CACHE: join(scratchDir, "node-compile-cache"),
      },
      async () => {
        // Observe native spawns without substituting ASC's owned spawner or draining
        // stdout (the backpressure tests deliberately leave it unread). The builtin
        // hook also covers helpers launched inside createAscExecutionRuntime.
        childProcess.spawn = (command, args, options) => {
          const isHelper =
            Array.isArray(args) &&
            args.some((arg) => /subagent-pi-json-filter-v2\.(ts|js)$/.test(arg));
          const helper = nativeSpawn(
            command,
            args,
            isHelper
              ? {
                  ...options,
                  env: {
                    ...process.env,
                    ...options?.env,
                    PATH: process.env.PATH,
                    PI_CODING_AGENT_DIR: agentDir,
                    TMPDIR: scratchDir,
                    NODE_COMPILE_CACHE: join(scratchDir, "node-compile-cache"),
                  },
                }
              : options,
          );
          if (!isHelper) return helper;
          const record = { helper, groups: new Set(), closed: false, exited: false };
          records.push(record);
          captureTransportCustody(record);
          helper.fixtureCaptureGroups = () => captureGroups(record);
          helper.fixtureSignals = [];
          const nativeKill = helper.kill;
          helper.kill = function (signal) {
            helper.fixtureSignals.push(signal);
            captureGroups(record);
            return nativeKill.call(this, signal);
          };
          helper.once("exit", () => {
            record.exited = true;
          });
          helper.once("close", () => {
            record.closed = true;
          });
          return helper;
        };
        syncBuiltinESMExports();
        monitor = setInterval(() => records.forEach(captureGroups), 10);
        let result;
        let failure;
        let failed = false;
        try {
          result = await run(tempDir, { agentDir, scratchDir, records });
        } catch (error) {
          failure = error;
          failed = true;
        }
        try {
          // Runs on success AND assertion/barrier failures. Never delete live scratch.
          await stopFixtureHelpers(records);
        } catch (error) {
          preserve = true;
          throw new AggregateError(
            failed ? [failure, error] : [error],
            `Fixture cleanup uncertain; preserved ${tempDir}`,
          );
        } finally {
          clearInterval(monitor);
          childProcess.spawn = nativeSpawn;
          syncBuiltinESMExports();
        }
        if (failed) throw failure;
        return result;
      },
    );
  } finally {
    activeFixture = false;
    if (tempDir && !preserve) await rm(tempDir, { recursive: true, force: true });
  }
}

export async function withTemporaryEnv(overrides, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export const resistantRawPi = [
  "#!/usr/bin/env node",
  'const { spawn } = require("node:child_process");',
  'const { writeFileSync } = require("node:fs");',
  'process.on("SIGTERM", () => {});',
  'const descendant = spawn(process.execPath, ["-e",',
  `  ${JSON.stringify('process.on("SIGTERM", () => {}); process.send("term-handler-ready"); setInterval(() => {}, 1000);')}],`,
  '  { stdio: ["ignore", "ignore", "ignore", "ipc"] });',
  'descendant.once("message", (ack) => {',
  '  if (ack !== "term-handler-ready") throw new Error("missing resistant descendant ACK");',
  '  writeFileSync(process.env.PI_PROVENANCE_OUTPUT_FILE, process.pid + " " + descendant.pid);',
  '  writeFileSync(process.env.PI_PROVENANCE_OUTPUT_FILE + ".agent-dir", process.env.PI_CODING_AGENT_DIR);',
  '  console.log(JSON.stringify({ type: "agent_start" }));',
  '  console.log("raw-child-ready " + process.pid + " " + descendant.pid);',
  "});",
  "setInterval(() => {}, 1000);",
  "",
].join("\n");

export function spawnSupervisedFixture(tempRoot) {
  return childProcess.spawn(
    process.execPath,
    [
      join(process.cwd(), "extensions/self/subagent-pi-json-filter-v2.ts"),
      "--cwd",
      tempRoot,
      "--model",
      "test/model",
      "--tools",
      "read,bash",
      "--thinking",
      "off",
      "--session-file",
      join(tempRoot, "helper-stop.jsonl"),
      "--objective",
      "Stop raw work when helper custody pipe closes",
      "--startup-timeout-ms",
      "5000",
      "--execution-timeout-ms",
      "0",
    ],
    {
      cwd: tempRoot,
      env: { ...process.env, PI_PROVENANCE_OUTPUT_FILE: join(tempRoot, "raw-pi.pid") },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

// Readiness ACK covers both installed TERM handlers, not just PID existence.
export function waitForRawChildFixture(
  helper,
  { setAdmissionTimeout = setTimeout, clearAdmissionTimeout = clearTimeout } = {},
) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let admissionTimer;
    const cleanup = () => {
      clearAdmissionTimeout(admissionTimer);
      helper.stdout.off("data", onData);
      helper.off("exit", onExit);
      helper.off("error", onError);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code, signal) =>
      onError(new Error(`helper exited before raw-child barrier: ${code}/${signal}`));
    const onData = (chunk) => {
      buffer += chunk;
      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline === -1) break;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let event;
        try {
          event = JSON.parse(line);
        } catch (error) {
          onError(error);
          return;
        }
        if (event.type !== "stdout_noise") continue;
        const match = /^raw-child-ready (\d+) (\d+)$/.exec(event.line);
        if (!match) continue;
        helper.fixtureCaptureGroups?.();
        cleanup();
        resolve(match.slice(1).map(Number));
        return;
      }
    };
    // Separate fixture admission budget, matching the helper's existing 5000ms
    // startup budget. agent_start cancels production startup but does not prove
    // the descendant ACK; unlimited execution must not strand this barrier.
    helper.stdout.setEncoding("utf8");
    helper.stdout.on("data", onData);
    helper.once("exit", onExit);
    helper.once("error", onError);
    admissionTimer = setAdmissionTimeout(
      () => onError(new Error("raw-child fixture admission timed out after 5000ms")),
      5_000,
    );
  });
}
