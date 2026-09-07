import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "task5480-pack-proof-"));
function run(command, args, cwd = scratch) {
  const r = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 120000 });
  writeFileSync(
    join(scratch, `command-${run.count++}.log`),
    JSON.stringify(
      { command, args, status: r.status, stdout: r.stdout, stderr: r.stderr },
      null,
      2,
    ),
  );
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
run.count = 0;
const little = Object.values(
  JSON.parse(run("npm", ["pack", "--json", "--pack-destination", scratch], root)),
)[0];
const adapter = Object.values(
  JSON.parse(
    run(
      "npm",
      ["pack", "--json", "--pack-destination", scratch],
      join(root, "../pi-society-orchestrator"),
    ),
  ),
)[0];
for (const pack of [little, adapter]) {
  assert.ok(pack.files.some((f) => f.path.includes("dist/task-session")));
  assert.ok(
    !pack.files.some(
      (f) => f.path.includes("task-session") && /tests|fixtures|native\.c/.test(f.path),
    ),
  );
}
assert.ok(little.files.some((f) => f.path.endsWith("custody-linux-x64.node")));
writeFileSync(
  join(scratch, "package.json"),
  JSON.stringify({
    name: "task5480-synthetic-packed-consumer",
    version: "1.0.0",
    private: true,
    type: "module",
  }),
);
run("npm", [
  "install",
  "--ignore-scripts",
  "--omit=dev",
  "--no-audit",
  "--no-fund",
  join(scratch, little.filename),
  join(scratch, adapter.filename),
  "@earendil-works/pi-coding-agent@0.84.4",
  "@earendil-works/pi-ai@0.84.4",
  "@earendil-works/pi-tui@0.84.4",
]);
const proof = `
import assert from 'node:assert/strict';
import os from 'node:os';
import {syncBuiltinESMExports} from 'node:module';
import {taskSessionCapability} from '@tryinget/pi-little-helpers/task-session-core';
import {taskSessionAdapterIdentity} from '@tryinget/pi-society-orchestrator/task-session-adapter';
import {native} from './node_modules/@tryinget/pi-little-helpers/dist/task-session/native.js';
import {assertSdkIdentity} from './node_modules/@tryinget/pi-little-helpers/dist/task-session/identity.js';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {sealedHost} from './node_modules/@tryinget/pi-little-helpers/dist/task-session/host.js';
import {captureResources} from './node_modules/@tryinget/pi-little-helpers/dist/task-session/resources.js';
import {getModel} from '@earendil-works/pi-ai/compat';
import {zstdDecompressSync} from 'node:zlib';
const account=os.userInfo(),emptyHome=process.cwd()+'/unprovisioned-os-home';mkdirSync(emptyHome,{mode:0o700});
os.userInfo=()=>({...account,homedir:emptyHome});syncBuiltinESMExports();
assert.equal((await taskSessionCapability()).admissionAvailable,false);
assert.equal(taskSessionAdapterIdentity.configurationRequired,true);
assert.equal(Object.hasOwn(taskSessionAdapterIdentity,"integrationReady"),false);
assertSdkIdentity();
const shared='node_modules/@earendil-works/pi-ai/dist/api/openai-responses-shared.js';
const original=readFileSync(shared);try{writeFileSync(shared,Buffer.concat([original,Buffer.from('\\n// synthetic tamper\\n')]));assert.throws(assertSdkIdentity,/sdk_identity_unsupported/);}finally{writeFileSync(shared,original);}
assertSdkIdentity();
writeFileSync('synthetic.lock','',{mode:0o600});const n=native(),h=n.openMutex(process.cwd()+'/synthetic.lock');
assert.equal(n.tryLock(h),true);n.unlockMutex(h);n.closeMutex(h);
const cwd=process.cwd()+'/synthetic-checkout';mkdirSync(cwd);mkdirSync(cwd+'/.git');mkdirSync(cwd+'/agent');
const profile={model:getModel('openai-codex','gpt-5.4'),reasoning:'high',account:'synthetic',runDeadline:Date.now()+60000};
const credential={type:'oauth',access:'synthetic.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:'synthetic'}})).toString('base64url')+'.synthetic',refresh:'synthetic',expires:Date.now()+3600000};
let sends=0;
const host=await sealedHost({incarnation:'synthetic',cwd,objective:'literal packed proof',profile,resources:captureResources(cwd,cwd+'/agent')},credential,{send:async(_url,init)=>{
  sends++;const body=JSON.parse(zstdDecompressSync(init.body).toString());assert.equal(body.model,profile.model.id);assert.equal(init.redirect,'error');
  return new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[],usage:{input_tokens:1,output_tokens:1}}})+'\\n\\n',{headers:{'content-type':'text/event-stream'}});
}});
assert.equal(sends,0);host.admit(Date.now()+30000);await host.dispatchAfterClosed(()=>{});assert.equal(sends,1);
console.log(JSON.stringify({publicCore:true,adapter:true,sdkIdentity:true,nativePackLoad:true,packedSyntheticSdkCodex:true,node:process.version}));
`;
writeFileSync(join(scratch, "proof.mjs"), proof);
const verified = JSON.parse(run(process.execPath, ["proof.mjs"]));
// Run the same real startup/bridge process suite against the extracted artifact, not source dist.
mkdirSync(join(scratch, "tests/fixtures/task-session"), { recursive: true });
const suites = [
  "task-session-startup.test.mjs",
  "task-session-review.test.mjs",
  "task-session-identity.test.mjs",
  "task-session-owner-model.test.mjs",
  "task-session-owner-reasoning.test.mjs",
  "task-session-public-profiles.test.mjs",
  "task-session-producer.test.mjs",
];
for (const suite of suites)
  writeFileSync(
    join(scratch, "tests", suite),
    readFileSync(join(root, "tests", suite), "utf8").replaceAll(
      "../dist/task-session/",
      "../node_modules/@tryinget/pi-little-helpers/dist/task-session/",
    ),
  );
for (const file of [
  "startup-host.mjs",
  "startup-fixture.mjs",
  "profile-public-loader.mjs",
  "startup-real-tui.mjs",
  "pty-viewer.py",
  "startup-viewer.mjs",
  "startup-supervisor.c",
  "ak-supervisor.py",
  "ak-supervisor.sha256",
  "run-owner-supervisor.py",
  "synthetic-native-worker.py",
]) {
  const data = readFileSync(join(root, "tests/fixtures/task-session", file), "utf8").replaceAll(
    "../../../dist/task-session/",
    "../../../node_modules/@tryinget/pi-little-helpers/dist/task-session/",
  );
  writeFileSync(join(scratch, "tests/fixtures/task-session", file), data);
}
run(process.execPath, ["--test", ...suites.map((s) => `tests/${s}`)]);
verified.packedStartupProcessSuite = true;
verified.packedReviewRegressions = true;
const help = run(process.execPath, [
  "node_modules/@tryinget/pi-little-helpers/dist/task-session/bin.js",
  "--help",
]);
assert.match(help, /DB-free/);
const summary = {
  scratch,
  verified,
  packages: [little, adapter].map((p) => ({
    name: p.name,
    filename: p.filename,
    integrity: p.integrity,
    shasum: p.shasum,
    files: p.files.length,
    size: p.size,
  })),
  liveActivation: false,
  producerIntegration: false,
};
writeFileSync(join(scratch, "evidence.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
