// AK6872: dependency-closure admission and native process boundary, exercised end to end
// through extract() with inert caller HTML (no page transport) and real child processes.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  admitNative,
  GUARD_OPT_IN,
  NETWORK_GUARD,
  nativeBoundary,
  permissionArgs,
} from "../src/closure.ts";
import { extract, runNative } from "../src/native.ts";
import { environment, fixture } from "./helpers.ts";
import { artifactRoot, observers, probeCli } from "./native-fixture.ts";

const run = promisify(execFile);
// AK6872 B2: on Node < 25 native capture fails closed unless the operator opts in to the
// in-process guard. These tests opt in explicitly; native-boundary tests the default refusal.
process.env.PI_OBSIDIAN_CLIPPER_INPROCESS_NETWORK_GUARD = "1";

const dependent = "process.stdout.write('Dependency says ' + require('dep').word);";
const dep = { "node_modules/dep/package.json": '{"name":"dep","main":"index.js"}' };
const depIndex = { "node_modules/dep/index.js": "exports.word = 'inside-closure';" };
async function capture(cli: string, dir: string) {
  return environment({ PI_OBSIDIAN_CLIPPER_CLI: cli, TMPDIR: dir }, () =>
    extract("https://example.com/", "<p>fixture</p>"),
  ) as ReturnType<typeof extract>;
}
const CLOSURE = /closure/i;
const RUNTIME_NET = process.allowedNodeEnvironmentFlags.has("--allow-net");

test("closure control: in-root dependency and in-root symlinks are admitted and executed", async () => {
  const f = await fixture();
  try {
    const a = await artifactRoot(f.dir, dependent, { ...dep, ...depIndex });
    await mkdir(join(a.root, "node_modules/.bin"), { mode: 0o700 });
    await symlink("../dep/index.js", join(a.root, "node_modules/.bin/dep"));
    const result = await capture(a.cli, f.dir);
    assert.equal(result.markdown, "Dependency says inside-closure");
    assert.equal(result.saved, false);
    assert.deepEqual(result.engine.boundary, {
      permissionModel: "node-permission-read-only",
      network: RUNTIME_NET ? "runtime-permission" : "in-process-guard",
      osSandbox: false,
    });
  } finally {
    await f.dispose();
  }
});
for (const [name, prepare] of [
  [
    "group/world-writable dependency file",
    async (root: string) => chmod(join(root, "node_modules/dep/index.js"), 0o666),
  ],
  [
    "group/world-writable dependency directory",
    async (root: string) => chmod(join(root, "node_modules/dep"), 0o777),
  ],
  [
    "group-writable package root manifest",
    async (root: string) => chmod(join(root, "package.json"), 0o620),
  ],
] as const) {
  test(`closure rejects ${name} before spawning`, async () => {
    const f = await fixture();
    try {
      const a = await artifactRoot(f.dir, dependent, { ...dep, ...depIndex });
      await prepare(a.root);
      await assert.rejects(capture(a.cli, f.dir), CLOSURE);
    } finally {
      await f.dispose();
    }
  });
}
test("closure rejects dependency file and directory symlinks resolving outside the root", async () => {
  for (const kind of ["file", "dir"]) {
    const f = await fixture();
    try {
      const outside = join(f.dir, "outside");
      await mkdir(join(outside, "dep"), { recursive: true, mode: 0o700 });
      await writeFile(join(outside, "dep/index.js"), "exports.word = 'redirected';", {
        mode: 0o600,
      });
      await writeFile(join(outside, "dep/package.json"), dep["node_modules/dep/package.json"], {
        mode: 0o600,
      });
      const a = await artifactRoot(f.dir, dependent, kind === "file" ? dep : {});
      if (kind === "file")
        await symlink(join(outside, "dep/index.js"), join(a.root, "node_modules/dep/index.js"));
      else {
        await mkdir(join(a.root, "node_modules"), { mode: 0o700 });
        await symlink(join(outside, "dep"), join(a.root, "node_modules/dep"));
      }
      await assert.rejects(capture(a.cli, f.dir), CLOSURE, kind);
    } finally {
      await f.dispose();
    }
  }
});
test("closure rejects dangling symlinks and special files", async () => {
  for (const kind of ["dangling", "fifo"]) {
    const f = await fixture();
    try {
      const a = await artifactRoot(f.dir, "process.stdout.write('Body text')", {
        ...dep,
        ...depIndex,
      });
      const target = join(a.root, "node_modules/dep/extra");
      if (kind === "dangling") await symlink(join(a.root, "missing"), target);
      else await run("mkfifo", ["-m", "600", target]);
      await assert.rejects(capture(a.cli, f.dir), CLOSURE, kind);
    } finally {
      await f.dispose();
    }
  }
});
test("dependency available only in an ancestor node_modules outside the closure cannot load", async () => {
  const f = await fixture();
  try {
    const ambient = join(f.dir, "node_modules/dep");
    await mkdir(ambient, { recursive: true, mode: 0o700 });
    await writeFile(join(ambient, "package.json"), dep["node_modules/dep/package.json"], {
      mode: 0o600,
    });
    await writeFile(join(ambient, "index.js"), "exports.word = 'ambient';", { mode: 0o600 });
    const a = await artifactRoot(f.dir, dependent);
    // Control: without the boundary Node's resolver walks up and loads the ambient module.
    const direct = await run(process.execPath, [a.cli], { cwd: f.dir, env: {} });
    assert.equal(direct.stdout, "Dependency says ambient");
    await assert.rejects(capture(a.cli, f.dir), (error: Error) => {
      assert.match(error.message, /Native capture failed \(exit 1\)/);
      assert.doesNotMatch(error.message, /ambient/);
      return true;
    });
  } finally {
    await f.dispose();
  }
});
test("native child outbound network, child processes and outside file access are denied and observed", async () => {
  const f = await fixture();
  const seen = await observers();
  try {
    await mkdir(join(f.dir, "outside"), { mode: 0o700 });
    await writeFile(join(f.dir, "outside/secret.txt"), "OUTSIDE-SECRET", { mode: 0o600 });
    const a = await artifactRoot(f.dir, probeCli, { "ports.json": JSON.stringify(seen.ports) });
    // Causal control: the same probe run directly (no adapter boundary) reaches the observers.
    const direct = await run(process.execPath, [a.cli], { cwd: f.dir, env: {}, timeout: 20000 });
    const control = JSON.parse(direct.stdout.replace(/^Probe report /, ""));
    assert.equal(control.tcp, "connected");
    assert.equal(control.udp, "sent");
    assert.equal(control.udpHandle, "sent");
    assert.equal(control.unix, "connected");
    assert.equal(control.listen, "listening");
    assert.equal(control.outsideRead, "read");
    const before = { tcp: seen.tcp, udp: seen.udp };
    assert.ok(before.tcp >= 1 && before.udp >= 1, JSON.stringify(before));
    await rm(join(f.dir, "outside/written.txt"));
    const result = await capture(a.cli, f.dir);
    const report = JSON.parse(result.markdown.replace(/^Probe report /, ""));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual({ tcp: seen.tcp, udp: seen.udp }, before, "observer saw native traffic");
    for (const key of [
      "tcp",
      "tls",
      "http",
      "fetch",
      "udp",
      "udpHandle",
      "listen",
      "listen2",
      "unix",
      "dns",
      "child",
      "outsideRead",
      "outsideWrite",
    ])
      assert.match(report[key] ?? "missing", /^denied:/, `${key}: ${report[key]}`);
    await assert.rejects(stat(join(f.dir, "outside/written.txt")));
    assert.equal(await readFile(join(f.dir, "outside/secret.txt"), "utf8"), "OUTSIDE-SECRET");
  } finally {
    await seen.close();
    await f.dispose();
  }
});
test("closure budgets, flag-unsafe roots and spawn-time re-admission fail closed", async () => {
  const f = await fixture();
  try {
    const a = await artifactRoot(f.dir, "process.stdout.write('Body text')", {
      "node_modules/a/b/c/index.js": "",
    });
    const admitted = await admitNative(a.cli);
    assert.equal(admitted.root, a.root);
    await assert.rejects(
      admitNative(a.cli, undefined, { entries: admitted.entries - 1, depth: 64 }),
      /budget/,
    );
    await assert.rejects(admitNative(a.cli, undefined, { entries: 50000, depth: 3 }), /budget/);
    await admitNative(a.cli, undefined, { entries: admitted.entries, depth: 5 });
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(admitNative(a.cli, aborted.signal), /cancelled/);
    // C1 is checked on the realpath: a cli.cjs link to another dist file is refused.
    await writeFile(join(a.root, "dist/other.cjs"), "process.stdout.write('Body text')", {
      mode: 0o600,
    });
    await symlink(join(a.root, "dist/other.cjs"), join(f.dir, "cli.cjs"));
    await assert.rejects(admitNative(join(f.dir, "cli.cjs")), /realpath must be/);
    const comma = await artifactRoot(join(f.dir, "a,b"), "process.stdout.write('Body text')");
    await assert.rejects(capture(comma.cli, f.dir), /permission flags/);
    // runNative re-admits right before spawning, independent of extract's preflight.
    await chmod(join(a.root, "node_modules/a/b"), 0o777);
    await assert.rejects(
      runNative(a.cli, "https://example.com/", f.dir, new AbortController().signal),
      CLOSURE,
    );
  } finally {
    await f.dispose();
  }
});
test("each network-denial mechanism independently blocks the probe the observers can see", async () => {
  const f = await fixture();
  const seen = await observers();
  try {
    await mkdir(join(f.dir, "outside"), { mode: 0o700 });
    await writeFile(join(f.dir, "outside/secret.txt"), "OUTSIDE-SECRET", { mode: 0o600 });
    const a = await artifactRoot(f.dir, probeCli, { "ports.json": JSON.stringify(seen.ports) });
    const probe = async (args: string[]) => {
      const before = { tcp: seen.tcp, udp: seen.udp };
      const { stdout } = await run(process.execPath, [...args, a.cli], { cwd: f.dir, env: {} });
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        report: JSON.parse(stdout.replace(/^Probe report /, "")),
        traffic: { tcp: seen.tcp - before.tcp, udp: seen.udp - before.udp },
      };
    };
    // The in-process guard alone (no permission model) on this runtime.
    const guard = await probe(["--require", NETWORK_GUARD]);
    assert.deepEqual(guard.traffic, { tcp: 0, udp: 0 });
    for (const key of [
      "tcp",
      "tls",
      "http",
      "fetch",
      "udp",
      "udpHandle",
      "listen",
      "listen2",
      "unix",
      "dns",
    ])
      assert.match(guard.report[key], /^denied:ERR_PI_CLIPPER_NETWORK_DENIED/, key);
    // The permission model alone (no guard).
    const permission = await probe(["--permission", `--allow-fs-read=${a.root}`]);
    assert.match(permission.report.child, /^denied:ERR_ACCESS_DENIED/);
    assert.match(permission.report.outsideRead, /^denied:ERR_ACCESS_DENIED/);
    if (RUNTIME_NET) {
      assert.deepEqual(permission.traffic, { tcp: 0, udp: 0 });
      for (const key of ["tcp", "fetch", "udp", "dns"])
        assert.match(permission.report[key], /^denied:ERR_ACCESS_DENIED/, key);
      for (const key of ["udpHandle", "unix"])
        assert.match(permission.report[key], /^denied:/, key);
      assert.match(permission.report.listen, /^denied:ERR_ACCESS_DENIED/);
    } else {
      // Why the guard exists: this runtime's permission model does not cover network.
      assert.equal(permission.report.tcp, "connected");
      assert.ok(permission.traffic.tcp >= 1);
    }
    assert.deepEqual(
      permissionArgs(a.root, f.dir).boundary.network,
      RUNTIME_NET ? "runtime-permission" : "in-process-guard",
    );
  } finally {
    await seen.close();
    await f.dispose();
  }
});
test("runtimes without --allow-net refuse native capture unless the operator opts in", async () => {
  const f = await fixture();
  try {
    const a = await artifactRoot(f.dir, "process.stdout.write('Body text')");
    await environment({ [GUARD_OPT_IN]: "" }, async () => {
      if (RUNTIME_NET) {
        assert.equal(nativeBoundary().boundary.network, "runtime-permission");
        assert.equal((await capture(a.cli, f.dir)).markdown, "Body text");
      } else {
        assert.throws(() => nativeBoundary(), /refused.*cannot deny network/);
        await assert.rejects(capture(a.cli, f.dir), /refused.*cannot deny network/);
        await assert.rejects(
          runNative(a.cli, "https://example.com/", f.dir, new AbortController().signal),
          /refused/,
        );
      }
    });
    await environment({ [GUARD_OPT_IN]: "1" }, async () => {
      assert.equal(
        (await capture(a.cli, f.dir)).engine.boundary.network,
        RUNTIME_NET ? "runtime-permission" : "in-process-guard",
      );
    });
  } finally {
    await f.dispose();
  }
});
