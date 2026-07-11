#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [packageRoot, installedPackage, fixturePath] = process.argv.slice(2);
if (!packageRoot || !installedPackage || !fixturePath) {
  throw new Error("usage: release-smoke-client.mjs <package-root> <installed-package> <fixture>");
}

const packageManifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const releaseMarker = `release:${packageManifest.version}`;

const installedBundle = path.join(installedPackage, "dist/snapshot-edit.js");
const isolatedEnvironment = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
  NPM_CONFIG_PREFIX: process.env.NPM_CONFIG_PREFIX,
  NPM_CONFIG_OFFLINE: "true",
  PI_SNAPSHOT_EDIT_RELEASE_SMOKE: "1",
  PI_OFFLINE: "1",
  HTTP_PROXY: "http://127.0.0.1:9",
  HTTPS_PROXY: "http://127.0.0.1:9",
  ALL_PROXY: "http://127.0.0.1:9",
  NO_PROXY: "",
};
const child = spawn("pi", ["--mode", "rpc", "--no-session", "-e", installedBundle], {
  cwd: path.dirname(fixturePath),
  env: isolatedEnvironment,
  stdio: ["pipe", "pipe", "pipe"],
});
let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const events = [];
const waiters = [];
let buffer = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const newline = buffer.indexOf("\n");
    const line = buffer.slice(0, newline).replace(/\r$/, "");
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const event = JSON.parse(line);
    events.push(event);
    for (const waiter of [...waiters]) waiter();
  }
});

function waitFor(predicate, description) {
  return new Promise((resolve, reject) => {
    const inspect = () => {
      const index = events.findIndex(predicate);
      if (index < 0) return;
      const [event] = events.splice(index, 1);
      clearTimeout(timer);
      waiters.splice(waiters.indexOf(inspect), 1);
      resolve(event);
    };
    const timer = setTimeout(() => {
      waiters.splice(waiters.indexOf(inspect), 1);
      reject(new Error(`Timed out waiting for ${description}; stderr: ${stderr}`));
    }, 20_000);
    waiters.push(inspect);
    inspect();
  });
}

let sequence = 0;
function send(type, fields = {}) {
  const id = `smoke-${++sequence}`;
  child.stdin.write(`${JSON.stringify({ id, type, ...fields })}\n`);
  return waitFor((event) => event.type === "response" && event.id === id, `${type} response`);
}

async function smoke(action, fields = {}, expectNotification = true) {
  const responsePromise = send("prompt", {
    message: `/snapshot-edit-release-smoke ${JSON.stringify({ action, ...fields })}`,
  });
  const notificationPromise = expectNotification
    ? waitFor(
        (event) =>
          event.type === "extension_ui_request" &&
          event.method === "notify" &&
          event.message?.startsWith("PI_SNAPSHOT_EDIT_RELEASE_SMOKE:"),
        `${action} notification`,
      )
    : undefined;
  const response = await responsePromise;
  assert.equal(response.success, true, JSON.stringify(response));
  if (!notificationPromise) return undefined;
  const notification = await notificationPromise;
  return JSON.parse(notification.message.slice("PI_SNAPSHOT_EDIT_RELEASE_SMOKE:".length));
}

const defaultBundle = path.join(packageRoot, "dist/snapshot-edit.js");
try {
  const commands = await send("get_commands");
  assert.equal(commands.success, true);
  assert.ok(
    commands.data.commands.some((command) => command.name === "snapshot-edit-release-smoke"),
  );

  const initial = await smoke("marker");
  assert.equal(initial.marker, releaseMarker);
  assert.equal(initial.behavior, `protocol-b:${releaseMarker}`);

  await writeFile(fixturePath, "same\nsame\n", { mode: 0o600 });
  const probe = await smoke("probe", { path: fixturePath });
  assert.equal(probe.rawRead, "revision:amber\nsame\nsame\n");
  assert.equal(await readFile(fixturePath, "utf8"), `same\nchanged:${releaseMarker}\n`);

  const legacy = await smoke("legacy-lines", { path: fixturePath });
  assert.match(legacy.rejected, /retired line coordinates/);

  await writeFile(fixturePath, "same\nsame\n", { mode: 0o600 });
  const beforeClear = await smoke("revision", { path: fixturePath });
  await smoke("clear");
  await smoke("expect-expired", { path: fixturePath, base: beforeClear.revision });

  const beforeReload = await smoke("revision", { path: fixturePath });
  execFileSync(process.execPath, ["scripts/build-extension.mjs"], {
    cwd: packageRoot,
    env: { ...process.env, PI_SNAPSHOT_EDIT_BUILD_MARKER: "reload-v2" },
    stdio: "pipe",
  });
  await copyFile(defaultBundle, installedBundle);
  await smoke("reload", {}, false);
  const afterReload = await smoke("marker");
  assert.equal(afterReload.marker, "reload-v2");
  assert.equal(afterReload.behavior, "protocol-b:reload-v2");
  await smoke("expect-expired", { path: fixturePath, base: beforeReload.revision });

  await writeFile(fixturePath, "same\nsame\n", { mode: 0o600 });
  await smoke("probe", { path: fixturePath });
  assert.equal(await readFile(fixturePath, "utf8"), "same\nchanged:reload-v2\n");
  console.log(
    "release smoke RPC passed: packed bundle, Protocol B, clear, and same-process reload",
  );
} finally {
  child.stdin.end();
  child.kill("SIGTERM");
  execFileSync(process.execPath, ["scripts/build-extension.mjs"], {
    cwd: packageRoot,
    stdio: "pipe",
  });
}
