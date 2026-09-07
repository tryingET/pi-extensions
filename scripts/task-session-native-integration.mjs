#!/usr/bin/env node
// Freeze is a preparation receipt, never a native passing result. No build fallback.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingNativeCases } from "../tests/task-session-native/coverage.mjs";
import {
  head,
  inventory,
  json,
  piPaths,
  sha,
  verifyPins,
} from "../tests/task-session-native/pins.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
try {
  const [verb, ...args] = process.argv.slice(2);
  if (verb === "freeze" && args.length === 6) {
    const [akRoot, receiptPath, native, candidate, piHead, output] = args;
    if (head(root) !== piHead)
      throw Error("Pi HEAD changed; review current source before freezing");
    const receipt = json(receiptPath);
    const artifacts = {};
    for (const [kind, path] of [
      ["native_fixture", native],
      ["candidate_debug", candidate],
    ]) {
      if (!existsSync(path)) throw Error(`PENDING_ARTIFACT ${kind}: ${path}`);
      const a = receipt.artifacts.find((a) => a.kind === kind);
      if (!a) throw Error(`PENDING_OWNER_RECEIPT ${kind}`);
      artifacts[kind] = { path: realpathSync(path), sha256: a.sha256 };
    }
    const pins = {
      schema: "pi.task-session.native-integration-pins.v1",
      releasePin: false,
      ak: {
        root: realpathSync(akRoot),
        head: head(akRoot),
        sourceCommit: receipt.source_commit,
        receipt: realpathSync(receiptPath),
        receiptSha256: sha(readFileSync(receiptPath)),
        sources: receipt.source_sha256,
      },
      pi: { root, head: piHead, sources: inventory(root, piPaths) },
      artifacts,
    };
    await verifyPins(pins);
    writeFileSync(output, `${JSON.stringify(pins, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(`FROZEN_NOT_EXECUTED ${output}`);
  } else if (verb === "run" && (args.length === 1 || args.length === 2)) {
    const pins = await verifyPins(json(args[0])); // No SDK, fixture or DB operation before this gate.
    const temp = process.env.TMPDIR;
    if (!temp || !existsSync(temp) || realpathSync(temp) !== resolve(temp))
      throw Error("canonical existing TMPDIR required");
    const result = spawnSync(
      process.execPath,
      [
        "--test",
        "--test-concurrency=1",
        ...(args[1] ? [`--test-name-pattern=${args[1]}`] : []),
        join(root, "tests/task-session-native/integration.test.mjs"),
      ],
      {
        stdio: "inherit",
        env: {
          PATH: "/usr/bin:/bin",
          LANG: "C.UTF-8",
          TMPDIR: temp,
          TASK_SESSION_NATIVE_PINS: realpathSync(args[0]),
          PI_OFFLINE: "1",
        },
      },
    );
    await verifyPins(pins); // Source churn invalidates compatibility even if assertions passed.
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    if (result.status === 0 && pendingNativeCases.length) {
      console.error(
        JSON.stringify({ status: "PARTIAL_NATIVE_EVIDENCE_NOT_COMPLETE", pendingNativeCases }),
      );
      process.exitCode = 78;
    }
  } else if (verb === "static" && args.length === 0) {
    const result = spawnSync(
      process.execPath,
      ["--test", join(root, "tests/task-session-native/contracts.test.mjs")],
      { stdio: "inherit" },
    );
    process.exitCode = result.status ?? 1;
  } else {
    throw Error(
      "usage: static | freeze AK_ROOT OWNER_RECEIPT NATIVE_ELF CANDIDATE_ELF EXACT_PI_HEAD OUTPUT | run PINS",
    );
  }
} catch (error) {
  console.error(`NOT_EXECUTED_OR_INVALID: ${error.message}`);
  process.exitCode = 78;
}
