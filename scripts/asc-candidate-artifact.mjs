#!/usr/bin/env node
/**
summary: "Pre-tag ASC planned identity and same-head retained candidate qualification; never publication authority."
read_when:
  - "Preparing a combined release PR with an unpublished numerical ASC edge."
*/
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASC_CANDIDATE_SCHEMA, ASC_NAME, ASC_SOURCE_PATH, ASC_CONSUMER_PATH, ASC_PLAN_PATH,
  ascArtifactHashes, ascCanonicalUrl, ascSourceInputs, ascConsumerSourceInputs, ascVersionInRange,
  verifyAscCandidateArtifact, verifyAscCandidateReceipt, verifyAscCandidatePending, verifyAscCandidateLocks,
  verifyAscCandidateInstalled, verifyAscInstalledContent,
} from '../packages/pi-society-orchestrator/src/runtime/asc-candidate-artifact.ts';
import { syncGeneratedAscRegistryOwner } from '../packages/pi-society-orchestrator/scripts/generate-asc-registry-owner.mjs';
import { lookupAscRegistryReleaseState, lookupAscRegistryArtifact, evaluateAscRegistryLock } from '../packages/pi-society-orchestrator/scripts/validate-asc-bridge-lifecycle.mjs';
import { verifyInstalledAscExecution } from './asc-candidate-execution.mjs';
import { validateAuthoredLocks } from './validate-package-installs.mjs';
import { prepareConsumerArtifact } from './asc-candidate-consumer.mjs';
import { requiresRetainedConsumerIdentity, verifyProductionAscInstalled } from './asc-registry-handoff.mjs';

let ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const run = (command, args, cwd = ROOT, env = process.env) => execFileSync(command, args, {
  cwd, env, stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024,
});

export function rejectCandidatePublication(env = process.env) {
  assert(!env.PI_ASC_CANDIDATE_RECEIPT, 'Candidate receipt cannot be used as registry proof or publication authorization');
}
export function assertPlannedPublicationBytes(plan, name, version, bytes) {
  assert.equal(plan.schema, 'pi.asc-candidate-plan.v1');
  assert.equal(plan.evidenceKind, 'planned_artifact_identity');
  assert.equal(plan.registryProvenance, false);
  assert.equal(plan.publicationAuthorized, false);
  const expected = name === ASC_NAME ? plan.artifact : plan.consumerArtifact;
  assert(expected, 'Missing retained candidate artifact identity');
  assert.equal(expected.name, name);
  assert.equal(expected.version, version);
  for (const [key, value] of Object.entries(ascArtifactHashes(bytes))) {
    assert.equal(expected[key], value, `Publication bytes differ from retained candidate: ${key}`);
  }
}
function packAsc(directory) {
  assert(directory && path.isAbsolute(directory), 'Absolute owned artifact directory required');
  fs.mkdirSync(directory, { recursive: true });
  assert.equal(fs.realpathSync(directory), directory, 'Artifact directory must be physical and canonical');
  assert.equal(fs.lstatSync(directory).isSymbolicLink(), false, 'Artifact directory cannot be a link');
  assert.equal(fs.readdirSync(directory).length, 0, 'Artifact directory must start empty');
  assert(process.env.TMPDIR, 'Owned TMPDIR required for immutable candidate build');
  const buildRoot = fs.mkdtempSync(path.join(process.env.TMPDIR, 'asc-candidate-build-'));
  const archive = path.join(buildRoot, 'source.tar');
  run('git', ['archive', '--output', archive, 'HEAD']);
  run('tar', ['-xf', archive, '-C', buildRoot]);
  fs.unlinkSync(archive);
  // Preparation may include a just-synchronized source lock before its pre-tag
  // commit. Copy the actual tracked ASC inputs; qualification subsequently
  // requires each of these bytes to be identical to immutable HEAD.
  for (const file of Object.keys(ascSourceInputs(ROOT))) {
    fs.mkdirSync(path.dirname(path.join(buildRoot, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(buildRoot, file));
  }
  const source = path.join(buildRoot, ASC_SOURCE_PATH);
  const pkg = read(path.join(source, 'package.json'));
  // This registry edge is deliberately a leaf. Do not silently omit a future dependency.
  assert.equal(Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).length, 0,
    'ASC acquired runtime dependencies; extend retained numerical closure before release');
  try {
    process.stdout.write(run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], source));
    const buildEnv = { ...process.env };
    delete buildEnv.PI_ASC_CANDIDATE_RECEIPT;
    delete buildEnv.GITHUB_SHA; // Exact source identity is asserted by the final receipt, not a staged export.
    const output = run(process.execPath, [path.join(buildRoot, 'scripts/release-artifact.mjs'), 'pack',
      '--package-path', ASC_SOURCE_PATH, '--artifact-dir', directory], buildRoot, buildEnv);
    // release-artifact writes its manifest alongside the single authoritative tarball.
    process.stdout.write(output);
  } finally { fs.rmSync(buildRoot, { recursive: true, force: true }); }
  const manifestFile = fs.readdirSync(directory).find(file => file.endsWith('.manifest.json'));
  assert(manifestFile, 'ASC packing omitted artifact manifest');
  const record = read(path.join(directory, manifestFile));
  const artifact = {
    name: record.package.name, version: record.package.version,
    relativePath: record.artifact.relativePath,
    ...ascArtifactHashes(fs.readFileSync(path.join(directory, record.artifact.relativePath))),
  };
  verifyAscCandidateArtifact(artifact, directory);
  return artifact;
}
export function preparePlan(directory) {
  // The source lock is an artifact input: synchronize it BEFORE computing SRI,
  // not after recording a plan that the subsequent root lock sync would stale.
  const sourceRoot = path.join(ROOT, ASC_SOURCE_PATH);
  const sourceLock = path.join(sourceRoot, 'package-lock.json');
  if (validateAuthoredLocks(ROOT).issues.some(issue => issue.package === ASC_SOURCE_PATH)) {
    const original = fs.readFileSync(sourceLock);
    try {
      process.stdout.write(run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], sourceRoot));
      assert(!validateAuthoredLocks(ROOT).issues.some(issue => issue.package === ASC_SOURCE_PATH), 'ASC source lock remains incoherent');
    } catch (error) { fs.writeFileSync(sourceLock, original); throw error; }
  }
  const sourceInputs = ascSourceInputs(ROOT);
  const artifact = packAsc(directory);
  assert.deepEqual(ascSourceInputs(ROOT), sourceInputs, 'Packing changed candidate source inputs');
  const consumerRoot = path.join(ROOT, ASC_CONSUMER_PATH);
  const pkg = read(path.join(consumerRoot, 'package.json'));
  const selector = pkg.dependencies[ASC_NAME];
  assert(ascVersionInRange(artifact.version, selector), 'Candidate version does not satisfy consumer selector');
  assert(![...(pkg.bundleDependencies ?? []), ...(pkg.bundledDependencies ?? [])].includes(ASC_NAME));
  const plan = {
    schema: 'pi.asc-candidate-plan.v1', evidenceKind: 'planned_artifact_identity',
    registryProvenance: false, publicationAuthorized: false, sourceInputs, selector, artifact,
  };
  const lockFile = path.join(consumerRoot, 'package-lock.json');
  const lock = read(lockFile);
  const key = `node_modules/${ASC_NAME}`;
  assert.equal(lock.lockfileVersion, 3);
  assert(lock.packages[key], 'Missing previous ASC owner');
  assert.deepEqual(Object.keys(lock.packages).filter(p => p.includes('pi-autonomous-session-control')), [key], 'Duplicate/local ASC lock owner');
  lock.packages[''].dependencies[ASC_NAME] = selector;
  lock.packages[key] = {
    version: artifact.version, resolved: ascCanonicalUrl(artifact.version), integrity: artifact.integrity,
    license: read(path.join(ROOT, ASC_SOURCE_PATH, 'package.json')).license,
    peerDependencies: read(path.join(ROOT, ASC_SOURCE_PATH, 'package.json')).peerDependencies,
    peerDependenciesMeta: read(path.join(ROOT, ASC_SOURCE_PATH, 'package.json')).peerDependenciesMeta,
    engines: read(path.join(ROOT, ASC_SOURCE_PATH, 'package.json')).engines,
  };
  // One bounded rollback boundary: plan, regular lock, and generated owner move together.
  const files = [lockFile, path.join(ROOT, ASC_PLAN_PATH),
    path.join(consumerRoot, 'src/runtime/governed-runtime-asc-owner.generated.ts')];
  const originals = files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : null);
  try {
    write(lockFile, lock);
    process.stdout.write(run('npm', ['cache', 'add', path.join(directory, artifact.relativePath)]));
    process.stdout.write(run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], consumerRoot));
    assert.equal(read(lockFile).packages[key].integrity, artifact.integrity, 'npm changed planned ASC bytes');
    assert(!validateAuthoredLocks(ROOT).issues.some(issue => issue.package === ASC_CONSUMER_PATH), 'Prepared consumer lock remains incoherent');
    const generated = syncGeneratedAscRegistryOwner(consumerRoot);
    assert(generated.ok, generated.issues.join('\n'));
    plan.consumerSourceInputs = ascConsumerSourceInputs(ROOT);
    plan.consumerArtifact = prepareConsumerArtifact(ROOT, path.join(directory, 'consumer'));
    assert.deepEqual(ascSourceInputs(ROOT), sourceInputs, 'Consumer preparation changed ASC inputs');
    assert.deepEqual(ascConsumerSourceInputs(ROOT), plan.consumerSourceInputs, 'Consumer packing changed source inputs');
    write(path.join(ROOT, ASC_PLAN_PATH), plan);
  } catch (error) {
    files.forEach((file, i) => originals[i] === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, originals[i]));
    throw error;
  }
  console.log('Prepared planned ASC identity, regular lock and generated owner BEFORE tagging; no registry/publication claim.');
  return plan;
}
export function qualify(directory, outputEnv) {
  const plan = read(path.join(ROOT, ASC_PLAN_PATH));
  const artifact = packAsc(directory);
  assert.deepEqual(artifact, plan.artifact, 'Rebuilt bytes differ from retained planned artifact');
  const sourceCommit = run('git', ['rev-parse', 'HEAD']).toString().trim();
  const receipt = {
    schema: ASC_CANDIDATE_SCHEMA, evidenceKind: 'retained_candidate_artifact',
    publicationAuthorized: false, registryProvenance: false, qualification: 'pending', sourceCommit,
    sourceInputs: ascSourceInputs(ROOT), selector: plan.selector, artifact,
  };
  const receiptPath = path.join(directory, 'candidate-receipt.pending.json');
  write(receiptPath, receipt);
  try {
  verifyAscCandidatePending(ROOT, receiptPath);
  const consumerRoot = path.join(ROOT, ASC_CONSUMER_PATH);
  verifyAscCandidateLocks(receipt, read(path.join(consumerRoot, 'package.json')), read(path.join(consumerRoot, 'package-lock.json')));
  const generated = syncGeneratedAscRegistryOwner(consumerRoot, { check: true });
  assert(generated.ok, generated.issues.join('\n'));
  // Populate content-addressed cache from retained bytes, not a fake HTTP response.
  // npm ci still checks the canonical planned URL/SRI; the receipt says why bytes are present.
  process.stdout.write(run('npm', ['cache', 'add', path.join(directory, artifact.relativePath)]));
  const installedRoot = fs.mkdtempSync(path.join(process.env.TMPDIR, 'asc-candidate-installed-'));
  try {
    const installedPkg = { name: 'asc-candidate-install-proof', version: '0.0.0', private: true, dependencies: { [ASC_NAME]: receipt.selector } };
    write(path.join(installedRoot, 'package.json'), installedPkg);
    write(path.join(installedRoot, 'package-lock.json'), { name: installedPkg.name, version: installedPkg.version,
      lockfileVersion: 3, requires: true, packages: { '': installedPkg,
        [`node_modules/${ASC_NAME}`]: read(path.join(consumerRoot, 'package-lock.json')).packages[`node_modules/${ASC_NAME}`] } });
    process.stdout.write(run('npm', ['ci', '--offline', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], installedRoot));
    verifyAscCandidateLocks(receipt, installedPkg, read(path.join(installedRoot, 'package-lock.json')),
      read(path.join(installedRoot, 'node_modules/.package-lock.json')));
    verifyAscInstalledContent(path.join(installedRoot, 'node_modules', ...ASC_NAME.split('/')),
      path.join(directory, artifact.relativePath), artifact.version, installedRoot);
    verifyInstalledAscExecution(installedRoot);
  } finally { fs.rmSync(installedRoot, { recursive: true, force: true }); }
  receipt.qualification = 'isolated_installed_execution';
  write(receiptPath, receipt);
  verifyAscCandidateReceipt(ROOT, receiptPath); // Recheck immutable inputs after installed execution.
  const qualifiedPath = path.join(directory, 'candidate-receipt.json');
  fs.renameSync(receiptPath, qualifiedPath);
  if (outputEnv) fs.appendFileSync(outputEnv, `PI_ASC_CANDIDATE_RECEIPT=${qualifiedPath}\n`);
  console.log(`Qualified retained candidate ${artifact.name}@${artifact.version} at ${sourceCommit}; not registry evidence.`);
  return receipt;
  } catch (error) {
    fs.rmSync(receiptPath, { force: true });
    throw error;
  }
}
async function registryHandoffCheck() {
  rejectCandidatePublication();
  const consumerRoot = path.join(ROOT, ASC_CONSUMER_PATH);
  const pkg = read(path.join(consumerRoot, 'package.json'));
  const lock = read(path.join(consumerRoot, 'package-lock.json'));
  const version = lock.packages[`node_modules/${ASC_NAME}`].version;
  const releases = lookupAscRegistryReleaseState();
  const lookup = lookupAscRegistryArtifact(version);
  assert(releases.ok && lookup.ok, releases.error ?? lookup.error);
  const evaluation = evaluateAscRegistryLock({ pkg, lock, registryReleaseState: releases, registryArtifact: lookup.artifact });
  assert(evaluation.ok, evaluation.issues.join('\n'));
  const generated = syncGeneratedAscRegistryOwner(consumerRoot, { check: true });
  assert(generated.ok, generated.issues.join('\n'));
  const response = await fetch(lookup.artifact.dist.tarball);
  assert(response.ok, 'Published ASC bytes unavailable');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(ascArtifactHashes(bytes).integrity, evaluation.integrity, 'Published ASC SRI mismatch');
  const planFile = path.join(ROOT, ASC_PLAN_PATH);
  const wave = process.env.RELEASE_WAVE_PATH ? read(process.env.RELEASE_WAVE_PATH) : null;
  if (wave?.components?.some(entry => entry.packageName === ASC_NAME)) {
    assert(fs.existsSync(planFile), 'Coordinated ASC handoff requires a pre-tag retained plan');
  }
  const plan = fs.existsSync(planFile) ? read(planFile) : null;
  const retainedRequired = requiresRetainedConsumerIdentity(plan, wave, pkg);
  if (retainedRequired) {
    assert(plan, 'Coordinated ASC handoff requires a pre-tag retained plan');
    assert.equal(plan.consumerArtifact?.name, pkg.name, 'Planned consumer identity mismatch');
    assert.equal(plan.consumerArtifact?.version, pkg.version, 'Planned consumer version mismatch');
    assertPlannedPublicationBytes(plan, ASC_NAME, version, bytes);
  }
  assert(process.env.TMPDIR, 'Owned TMPDIR required for registry signature proof');
  const scratch = fs.mkdtempSync(path.join(process.env.TMPDIR, 'asc-registry-proof-'));
  try {
    const downloaded = path.join(scratch, 'downloaded-registry-asc.tgz');
    fs.writeFileSync(downloaded, bytes, { flag: 'wx', mode: 0o600 });
    write(path.join(scratch, 'package.json'), { name: 'asc-registry-proof', version: '0.0.0', private: true, dependencies: { [ASC_NAME]: version } });
    // This isolated registry installation and cryptographic npm audit are production
    // evidence. No retained candidate receipt is accepted at this boundary.
    process.stdout.write(run('npm', ['install', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'], scratch));
    process.stdout.write(run('npm', ['audit', 'signatures', '--registry=https://registry.npmjs.org/'], scratch));
    verifyProductionAscInstalled({ project: scratch, tarball: downloaded, pkg, lock,
      registryReleaseState: releases, registryArtifact: lookup.artifact });
    verifyInstalledAscExecution(scratch);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  console.log(retainedRequired
    ? 'Registry ASC canonical bytes/signatures/SLSA verified; published bytes equal planned candidate.'
    : 'Registry ASC canonical bytes/signatures/SLSA verified; no candidate proof asserted.');
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(args[i]?.startsWith('--') && args[i + 1], 'Expected --option value');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (options['repo-root']) {
    assert(['registry-handoff-check', 'publication-check'].includes(command), 'Explicit source roots are read-only publication checks only');
    assert(path.isAbsolute(options['repo-root']), 'Publication source root must be absolute');
    ROOT = fs.realpathSync(options['repo-root']);
  }
  if (command === 'registry-handoff-check') return registryHandoffCheck();
  if (command === 'prepare-plan') return preparePlan(options['artifact-dir']);
  if (command === 'qualify-if-needed') {
    const pkg = read(path.join(ROOT, ASC_CONSUMER_PATH, 'package.json'));
    const lock = read(path.join(ROOT, ASC_CONSUMER_PATH, 'package-lock.json'));
    const version = lock.packages?.[`node_modules/${ASC_NAME}`]?.version;
    assert(ascVersionInRange(version, pkg.dependencies[ASC_NAME]), 'Locked ASC version excludes selector');
    const lookup = spawnSync('npm', ['view', `${ASC_NAME}@${version}`, 'version', '--json', '--registry=https://registry.npmjs.org/'], { encoding: 'utf8' });
    if (lookup.status === 0) {
      console.log('ASC is published; use unchanged production registry checks, not candidate evidence.');
      return;
    }
    assert(!lookup.error && /\bE404\b/.test(`${lookup.stdout}\n${lookup.stderr}`), 'Registry state indeterminate; refusing candidate fallback');
    return qualify(options['artifact-dir'], options['output-env-file']);
  }
  if (command === 'qualify') return qualify(options['artifact-dir'], options['output-env-file']);
  if (command === 'verify') return verifyAscCandidateReceipt(ROOT, options.receipt);
  if (command === 'verify-installed') return verifyAscCandidateInstalled(ROOT, options.receipt, path.resolve(ROOT, options['consumer-path'] ?? ASC_CONSUMER_PATH));
  if (command === 'publication-check') {
    rejectCandidatePublication();
    const planPath = path.join(ROOT, ASC_PLAN_PATH);
    const record = read(options.manifest);
    const wave = process.env.RELEASE_WAVE_PATH ? read(process.env.RELEASE_WAVE_PATH) : null;
    const coordinated = wave?.components?.some(entry => entry.packageName === ASC_NAME);
    const adopted = fs.existsSync(path.join(ROOT, 'scripts/asc-candidate-artifact.mjs'));
    if (!fs.existsSync(planPath)) {
      assert(!adopted || (!coordinated && record.package.name !== ASC_NAME), 'Coordinated ASC publication requires a pre-tag retained plan');
      return; // Legacy tags retain their original mandatory production checks.
    }
    if (![ASC_NAME, '@tryinget/pi-society-orchestrator'].includes(record.package.name)) return;
    const plan = read(planPath);
    if (record.package.name === ASC_NAME) {
      assert.deepEqual(ascSourceInputs(ROOT), plan.sourceInputs, 'Publication source inputs differ from candidate');
    } else {
      // A later independent consumer release with an already-published ASC is
      // production registry work, not a rebuild of this prepublication wave.
      if (!requiresRetainedConsumerIdentity(plan, wave, record.package)) return;
      assert.deepEqual(ascConsumerSourceInputs(ROOT), plan.consumerSourceInputs, 'Publication consumer inputs differ from retained candidate');
    }
    assertPlannedPublicationBytes(plan, record.package.name, record.package.version,
      fs.readFileSync(path.join(path.dirname(options.manifest), record.artifact.relativePath)));
    console.log('Publication tarball equals retained planned candidate bytes; registry checks remain mandatory.');
    return;
  }
  throw new Error('Usage: asc-candidate-artifact.mjs prepare-plan|qualify --artifact-dir <owned-dir> | verify|verify-installed --receipt <file> | publication-check --manifest <file>');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
