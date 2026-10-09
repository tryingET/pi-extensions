import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// This is a production-host loader check, not a live Pi/TUI or AK authority proof.
test(
  "extracted npm tarball loads/registers on an isolated production host without repo or dev-dependency fallback",
  { timeout: 110_000 },
  () => {
    const root = mkdtempSync(join(tmpdir(), "society-packed-"));
    const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    try {
      const rawPack = JSON.parse(
        execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", root], {
          cwd: packageRoot,
          encoding: "utf8",
        }),
      ) as
        | Array<{ filename: string; files: Array<{ path: string }> }>
        | Record<string, { filename: string; files: Array<{ path: string }> }>;
      const packed = Array.isArray(rawPack) ? rawPack : Object.values(rawPack);
      for (const module of [
        "command-runner",
        "config",
        "context-message",
        "payload-check",
        "refresh-lifecycle",
      ])
        assert.ok(
          packed[0].files.some((item) => item.path === `src/${module}.ts`),
          module,
        );
      const extracted = join(root, "extracted");
      mkdirSync(extracted);
      execFileSync("tar", ["-xzf", join(root, packed[0].filename), "-C", extracted]);
      const entry = join(extracted, "package", "extensions", "society-context.ts");
      assert.equal(existsSync(join(extracted, "package", "node_modules")), false);
      const host = join(root, "host");
      mkdirSync(host);
      const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
        devDependencies: Record<string, string>;
      };
      writeFileSync(
        join(host, "package.json"),
        JSON.stringify({
          private: true,
          type: "module",
          dependencies: {
            "@earendil-works/pi-coding-agent":
              manifest.devDependencies["@earendil-works/pi-coding-agent"],
          },
        }),
      );
      const env = {
        ...process.env,
        NODE_PATH: "",
        NODE_OPTIONS: "",
        npm_config_cache: join(root, "npm-cache"),
        JITI_CACHE_DIR: join(root, "jiti-cache"),
        PI_SOCIETY_STARTUP_CONTEXT: "0",
      };
      execFileSync(
        "npm",
        [
          "install",
          "--omit=dev",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
        ],
        { cwd: host, env, stdio: "pipe", timeout: 80_000 },
      );
      for (const dev of ["tsx", "typescript", "@biomejs/biome"])
        assert.equal(existsSync(join(host, "node_modules", dev)), false, dev);
      const probe = join(root, "probe.mjs");
      writeFileSync(
        probe,
        `import assert from 'node:assert/strict';
import {loadExtensions} from ${JSON.stringify(join(host, "node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js"))};
const result=await loadExtensions([${JSON.stringify(entry)}],${JSON.stringify(root)});
assert.deepEqual(result.errors,[]);
assert.equal(result.extensions.length,1);
const ext=result.extensions[0];
assert.equal(ext.resolvedPath,${JSON.stringify(entry)});
for(const name of ['session_start','session_shutdown','before_agent_start']) assert.equal(ext.handlers.get(name)?.length,1);
assert.equal(typeof ext.commands.get('society-context')?.handler,'function');
const ctx={cwd:${JSON.stringify(root)},hasUI:false};
await ext.handlers.get('session_start')[0]({},ctx);
assert.equal(await ext.handlers.get('before_agent_start')[0]({systemPrompt:'base'},ctx),undefined);
await ext.handlers.get('session_shutdown')[0]({},ctx);
console.log('isolated production-host registration passed');
`,
      );
      const output = execFileSync(process.execPath, [probe], {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 15_000,
      });
      assert.match(output, /isolated production-host registration passed/);
      // Closure negative control: removing an imported packed module must fail loading.
      rmSync(join(extracted, "package", "src", "refresh-lifecycle.ts"));
      assert.throws(() =>
        execFileSync(process.execPath, [probe], { cwd: root, env, stdio: "pipe", timeout: 15_000 }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
