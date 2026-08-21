import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildReleaseEvidenceAkAdapterResult } from '../src/runtime/release-evidence-ak-adapter.ts';
import registerReleaseEvidenceAkAdapter from '../extensions/release-evidence-ak-adapter.ts';

const commit = 'a'.repeat(40);
const tag = 'pi-example-v1.2.3';
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function writeCanonical(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function writeSidecar(file) { const d=digest(fs.readFileSync(file)); fs.writeFileSync(`${file}.sha256`, `${d}  ${path.basename(file)}\n`); return d; }
function record(file, root) { const bytes=fs.readFileSync(file); return {relativePath:path.relative(root,file).replaceAll(path.sep,'/'),sha256:digest(bytes),size:bytes.length}; }
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'release-ak-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const subject=path.join(root,'tryinget-example-1.2.3.tgz'); fs.writeFileSync(subject,'exact release bytes'); const subjectRec=record(subject,root); writeSidecar(subject);
 const local=path.join(root,'local-example-0.1.0.tgz'); fs.writeFileSync(local,'local bytes'); const localRec={name:'@tryinget/local-example',version:'0.1.0',...record(local,root)}; writeSidecar(local);
 const artifactPath=path.join(root,'tryinget-example-1.2.3.tgz.manifest.json');
 const artifact={schema:'pi.release-artifact.v1',package:{component:'example',name:'@tryinget/example',version:'1.2.3',repositoryPath:'packages/example'},source:{tag,commit},artifact:{basename:path.basename(subject),relativePath:subjectRec.relativePath,sha256:subjectRec.sha256,size:subjectRec.size},dependencies:{localArtifacts:[localRec]}};
 writeCanonical(artifactPath,artifact); const artifactRec=record(artifactPath,root);
 const sbomPath=path.join(root,'tryinget-example-1.2.3.tgz.spdx.json');
 const sbom={spdxVersion:'SPDX-2.3',dataLicense:'CC0-1.0',SPDXID:'SPDXRef-DOCUMENT',name:'@tryinget/example@1.2.3',documentNamespace:`https://github.com/tryingET/pi-extensions/sbom/${subjectRec.sha256}`,creationInfo:{created:'2026-08-21T00:00:00.000Z',creators:['Tool: test']},documentDescribes:['SPDXRef-Package'],packages:[{name:'@tryinget/example',SPDXID:'SPDXRef-Package',versionInfo:'1.2.3',checksums:[{algorithm:'SHA256',checksumValue:subjectRec.sha256}]}],relationships:[]};
 writeCanonical(sbomPath,sbom); const sbomRec={format:'SPDX-2.3',mode:'packed-manifest-declarations',...record(sbomPath,root),sourcePackageLock:null}; writeSidecar(sbomPath);
 const evidencePath=path.join(root,'tryinget-example-1.2.3.tgz.evidence.json');
 const evidence={schema:'pi.release-evidence.v1',producer:'scripts/release-sbom.mjs',subject:{name:'@tryinget/example',version:'1.2.3',...subjectRec},source:{tag,commit,sourceDateEpoch:1787270400},artifactManifest:artifactRec,sbom:sbomRec,localArtifacts:[localRec],toolchain:{npm:'12.0.2',script:'scripts/release-sbom.mjs'},boundaries:{claims:['Exact bytes are bound.'],nonclaims:['Does not prove safety.']}};
 writeCanonical(evidencePath,evidence); writeSidecar(evidencePath);
 return {root,evidencePath,subject,local,sbomPath,artifactPath};
}

test('plans canonical custody without calling AK and serializes exact args', async (t)=>{
 const f=fixture(t); let called=0;
 const result=await buildReleaseEvidenceAkAdapterResult({evidencePath:f.evidencePath,artifactRef:'github-release://tryingET/pi-extensions/pi-example-v1.2.3/release-evidence',repoRoot:f.root,taskId:7,recordEvidenceFn:async()=>{called++; return {ok:true,via:'ak'};}});
 assert.equal(result.status,'planned'); assert.equal(called,0); assert.equal(result.effect.akCalled,false);
 assert.equal(result.akEvidenceEntry.check_type,'pi-release-evidence-v1');
 assert.equal(result.akEvidenceEntry.task_id,7);
 assert.equal(result.akArgs.includes('--details'),true);
 const details=JSON.parse(result.akArgs[result.akArgs.indexOf('--details')+1]);
 assert.equal(details.release_tag,tag); assert.equal(details.source_commit,commit); assert.equal(details.local_artifacts.length,1); assert.match(details.authority_ceiling,/does not establish package safety/);
});

test('records only on explicit action and preserves repo custody scope', async (t)=>{
 const f=fixture(t); let observed;
 const result=await buildReleaseEvidenceAkAdapterResult({evidencePath:f.evidencePath,artifactRef:'github-release://tryingET/pi-extensions/pi-example-v1.2.3/release-evidence',repoRoot:f.root,action:'record',akConfig:{akPath:'/opt/ak',societyDb:'/tmp/society.db'},recordEvidenceFn:async(entry,_signal,config)=>{observed={entry,config}; return {ok:true,via:'ak'};}});
 assert.equal(result.status,'recorded'); assert.equal(result.effect.akCalled,true); assert.equal(observed.config.cwd,fs.realpathSync(f.root)); assert.equal(observed.entry.result,'pass');
});

test('fails closed when AK rejects custody', async (t)=>{
 const f=fixture(t);
 await assert.rejects(()=>buildReleaseEvidenceAkAdapterResult({evidencePath:f.evidencePath,artifactRef:'ref',repoRoot:f.root,action:'record',akConfig:{akPath:'ak',societyDb:'db'},recordEvidenceFn:async()=>({ok:false,via:'failed',akError:'repo not registered'})}),/repo not registered/);
});

test('rejects subject tampering and noncanonical evidence', async (t)=>{
 const f=fixture(t); fs.appendFileSync(f.subject,'tamper');
 await assert.rejects(()=>buildReleaseEvidenceAkAdapterResult({evidencePath:f.evidencePath,artifactRef:'ref',repoRoot:f.root}),/size differs|SHA-256 differs/);
 const f2=fixture(t); const parsed=JSON.parse(fs.readFileSync(f2.evidencePath,'utf8')); fs.writeFileSync(f2.evidencePath,JSON.stringify(parsed)); writeSidecar(f2.evidencePath);
 await assert.rejects(()=>buildReleaseEvidenceAkAdapterResult({evidencePath:f2.evidencePath,artifactRef:'ref',repoRoot:f2.root}),/canonical two-space JSON/);
});


test('registers an explicit plan-first Pi tool without touching AK at load time', () => {
  let registered = null;
  registerReleaseEvidenceAkAdapter({
    registerTool(tool) {
      registered = tool;
    },
  });
  assert.equal(registered.name, 'release_evidence_ak_adapter');
  assert.match(registered.description, /Does not publish, mutate release assets, or promote authority/);
  assert.match(registered.promptSnippet, /Use plan first/);
});
