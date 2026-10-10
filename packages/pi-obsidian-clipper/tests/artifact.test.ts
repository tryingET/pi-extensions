import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { parseNpmPackJson } from "../../../scripts/npm-pack-json.mjs";
import { contract, fixture } from "./helpers.ts";

const exec = promisify(execFile);
test("published production artifact contains and loads all runtime sources with pinned host", async () => {
  const f = await fixture();
  try {
    const home = join(f.dir, "home");
    await mkdir(home);
    const npmrc = join(home, ".npmrc");
    const globalrc = join(home, "global.npmrc");
    await writeFile(npmrc, "");
    await writeFile(globalrc, "");
    const env = {
      PATH: process.env.PATH,
      HOME: home,
      TMPDIR: f.dir,
      NPM_CONFIG_USERCONFIG: npmrc,
      NPM_CONFIG_GLOBALCONFIG: globalrc,
      NPM_CONFIG_CACHE: resolve(".scratch/npm-cache"),
      NPM_CONFIG_LOGLEVEL: "error",
      PI_OFFLINE: "1",
      PI_SKIP_VERSION_CHECK: "1",
      PI_TELEMETRY: "0",
    };
    const packed = await exec("npm", ["pack", "--json", "--pack-destination", f.dir], {
      env,
      maxBuffer: 65536,
    });
    const pack = parseNpmPackJson(packed.stdout);
    const paths = pack.files.map((file) => file.path);
    for (const file of [
      "extensions/obsidian-clipper.ts",
      "src/contract.ts",
      "src/transport.ts",
      "src/native.ts",
      "src/closure.ts",
      "src/native-guard.cjs",
    ])
      assert.ok(paths.includes(file), file);
    assert.ok(!paths.some((p) => /^(tests|node_modules|\.scratch|prompts)\//.test(p)));
    const installed = join(f.dir, "install");
    await mkdir(installed);
    await exec(
      "npm",
      [
        "install",
        "--prefix",
        installed,
        "--omit=dev",
        "--ignore-scripts",
        "--legacy-peer-deps",
        "--offline",
        "--no-audit",
        "--no-fund",
        join(f.dir, pack.filename),
      ],
      { env, maxBuffer: 65536 },
    );
    const root = join(installed, "node_modules/@tryinget/pi-obsidian-clipper");
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.dependencies).sort(), ["ipaddr.js"]);
    assert.equal(manifest.peerDependencies.typebox, "*");
    assert.equal(manifest.devDependencies.typebox, "1.3.7");
    const productionModules = await readdir(join(installed, "node_modules"), {
      withFileTypes: true,
    });
    assert.deepEqual(
      productionModules
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
      ["@tryinget", "ipaddr.js"],
    ); // No host packages or TypeBox physical copy in the production installation.
    const config = join(f.dir, "contract.json");
    await writeFile(config, JSON.stringify(contract()), { mode: 0o600 });
    const hostRoot = resolve("node_modules/@earendil-works/pi-coding-agent");
    const hostManifestPath = join(hostRoot, "package.json");
    const hostManifest = JSON.parse(await readFile(hostManifestPath, "utf8"));
    assert.equal(hostManifest.version, manifest["x-pi-template"].piHostContract.hostBaseline);
    assert.equal(hostManifest.version, manifest.devDependencies[hostManifest.name]);
    // The shipped bundle uses authentic host virtualModules (not unbundled jiti aliases).
    const loader = join(hostRoot, "dist/bundle/index.js");
    const smoke = `
      import assert from 'node:assert/strict';
      import {readFile,writeFile} from 'node:fs/promises';
      import {DefaultResourceLoader,SettingsManager,VERSION} from ${JSON.stringify(loader)};
      const host=JSON.parse(await readFile(${JSON.stringify(hostManifestPath)},'utf8'));
      assert.equal(VERSION,host.version);
      const settings=SettingsManager.inMemory({packages:[${JSON.stringify(root)}]});
      const resources=new DefaultResourceLoader({cwd:${JSON.stringify(home)},agentDir:${JSON.stringify(home)},settingsManager:settings,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true});
      await resources.reload(); const loaded=resources.getExtensions();
      assert.deepEqual(loaded.errors,[]); assert.deepEqual(loaded.warnings,[]);
      assert.equal(loaded.extensions.length,1);
      const runtime=loaded.runtime; const messages=[];
      runtime.sendMessage=(message,options)=>messages.push({message,options});
      assert.deepEqual(runtime.pendingProviderRegistrations,[]);
      assert.deepEqual(runtime.pendingNativeProviderRegistrations,[]);
      assert.deepEqual(runtime.pendingVirtualModelRegistrations,[]);
      assert.deepEqual(runtime.mcpServers.list(),[]);
      const ext=loaded.extensions[0]; assert.equal(ext.handlers.size,0);
      assert.deepEqual([...ext.tools.keys()],['obsidian_clipper_setup','obsidian_clipper_extract']);
      await ext.commands.get('obsidian-clipper').handler('help',{mode:'json',hasUI:false});
      assert.equal(JSON.parse(messages[0].message.content).save,'unsupported');
      assert.equal(messages[0].options.triggerTurn,false);
      const output=await ext.tools.get('obsidian_clipper_setup').definition.execute('id',{},undefined,undefined,{mode:'print',hasUI:false});
      const value=JSON.parse(output.content[0].text);
      assert.equal(value.model.providerModelId,'baseline-multimodal');assert.equal(value.payload,'text-only');
      // AK6872: the packaged closure admission, permission boundary and guard path work under the host loader.
      const extracted=await ext.tools.get('obsidian_clipper_extract').definition.execute('id',{url:'https://example.com/',html:'<p>x</p>'},undefined,undefined,{mode:'print',hasUI:false});
      assert.match(extracted.content[0].text,/Packaged native body/); assert.equal(extracted.details.saved,false);
      assert.deepEqual(extracted.details.engine.boundary,{permissionModel:'node-permission-read-only',network:process.allowedNodeEnvironmentFlags.has('--allow-net')?'runtime-permission':'in-process-guard',osSandbox:false});
      // Prove the real warning collector was exercised, rather than checking an always-empty field.
      const manifestPath=${JSON.stringify(join(root, "package.json"))};
      const original=await readFile(manifestPath,'utf8');
      try {
        const illegal=JSON.parse(original); illegal.dependencies.typebox='1.3.7';
        await writeFile(manifestPath,JSON.stringify(illegal)); await resources.reload();
        assert.deepEqual(resources.getExtensions().errors,[]);
        assert.ok(resources.getExtensions().warnings.some(({warning})=>/not dependencies: typebox/.test(warning)));
      } finally { await writeFile(manifestPath,original); }
      await resources.reload(); assert.deepEqual(resources.getExtensions().errors,[]);
      assert.deepEqual(resources.getExtensions().warnings,[]);
      console.log(JSON.stringify({artifactLoaded:true,setupExecuted:true,host:host.version}));
    `;
    const native = join(f.dir, "native");
    await mkdir(join(native, "dist"), { recursive: true, mode: 0o700 });
    await writeFile(join(native, "package.json"), "{}", { mode: 0o600 });
    await writeFile(join(native, "dist/cli.cjs"), "process.stdout.write('Packaged native body')", {
      mode: 0o600,
    });
    const result = await exec(process.execPath, ["--input-type=module", "--eval", smoke], {
      env: {
        ...env,
        PI_CODING_AGENT_DIR: home,
        PI_OBSIDIAN_CLIPPER_CONTRACT: config,
        PI_OBSIDIAN_CLIPPER_CLI: join(native, "dist/cli.cjs"),
        // Explicit B2 opt-in; only consulted on Node runtimes without --allow-net.
        PI_OBSIDIAN_CLIPPER_INPROCESS_NETWORK_GUARD: "1",
      },
      maxBuffer: 65536,
    });
    const proof = JSON.parse(result.stdout.trim());
    assert.equal(proof.artifactLoaded, true);
    assert.equal(proof.setupExecuted, true);
    assert.equal(proof.host, hostManifest.version);
    const cli = join(hostRoot, hostManifest.bin.pi);
    const version = await exec(process.execPath, [cli, "--version"], { env, maxBuffer: 65536 });
    assert.equal(version.stdout.trim(), hostManifest.version);
    for (const action of ["help", "status", "setup", "invalid"]) {
      const pending = exec(
        process.execPath,
        [
          cli,
          "--offline",
          "--no-extensions",
          "--no-context-files",
          "--no-skills",
          "--no-prompt-templates",
          "--no-themes",
          "--no-session",
          "-e",
          root,
          "-p",
          `/obsidian-clipper ${action}`,
        ],
        {
          cwd: home,
          env: { ...env, PI_CODING_AGENT_DIR: home, PI_OBSIDIAN_CLIPPER_CONTRACT: config },
          maxBuffer: 65536,
        },
      );
      pending.child.stdin.end(); // Pi reads piped stdin before processing print prompts.
      const headless = await pending;
      assert.doesNotMatch(
        headless.stderr,
        /Host-provided extension packages|duplicate runtime modules/,
      );
      assert.ok(headless.stdout.trim(), `${action}: no JSON output; stderr=${headless.stderr}`);
      const packet = JSON.parse(headless.stdout.trim());
      assert.equal(packet.schemaVersion, 1);
      if (action === "setup") assert.equal(packet.model.providerModelId, "baseline-multimodal");
      if (action === "status") assert.equal(packet.liveHealth, "not-probed");
      if (action === "invalid") assert.match(packet.error, /Use status/);
    }
  } finally {
    await f.dispose();
  }
});
test("module load and factory have no I/O, network, timers, processes or provider registration", async () => {
  const code = `
    import assert from 'node:assert/strict'; import fs from 'node:fs/promises';
    import child from 'node:child_process'; import https from 'node:https'; import dns from 'node:dns/promises';
    import {syncBuiltinESMExports} from 'node:module';
    const deny=()=>{throw new Error('unexpected load side effect')};
    fs.open=deny; child.spawn=deny; https.request=deny; dns.lookup=deny; globalThis.fetch=deny; globalThis.setTimeout=deny; globalThis.setInterval=deny;
    syncBuiltinESMExports();
    const {default:factory}=await import(${JSON.stringify(resolve("extensions/obsidian-clipper.ts"))});
    const tools=[];const commands=[];factory({registerTool:t=>tools.push(t),registerCommand:n=>commands.push(n)});
    assert.equal(tools.length,2);assert.deepEqual(commands,['obsidian-clipper']);console.log('load-only passed');
  `;
  const output = await exec(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "--eval", code],
    {
      env: {
        PATH: process.env.PATH,
        PI_OBSIDIAN_CLIPPER_CONTRACT: "/missing",
        PI_OBSIDIAN_CLIPPER_CLI: "/missing/cli.cjs",
      },
      maxBuffer: 65536,
    },
  );
  assert.equal(output.stdout.trim(), "load-only passed");
});
