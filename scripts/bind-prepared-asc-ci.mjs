#!/usr/bin/env node
// CI-only binding: replace one installed entry, never resolve or run lifecycle scripts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const NAME = '@tryinget/pi-autonomous-session-control';
const ENTRY = `node_modules/${NAME}`;
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function directory(file) {
  assert.ok(fs.lstatSync(file).isDirectory(), `Expected real directory: ${file}`);
  assert.equal(fs.realpathSync(file), path.resolve(file), `Noncanonical path: ${file}`);
}
function snapshot(root, ownedStage) {
  const result = {};
  function walk(rel) {
    if (rel === ENTRY || rel.startsWith(`${ENTRY}/`) || path.join(root, rel) === ownedStage) return;
    const file = path.join(root, rel);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      result[rel] = `link:${fs.readlinkSync(file)}`;
      const manifest = path.join(file, 'package.json');
      if (fs.existsSync(manifest)) result[`${rel}/package.json`] = digest(manifest);
    } else if (stat.isDirectory()) {
      result[rel] = 'directory';
      for (const name of fs.readdirSync(file).sort()) walk(path.join(rel, name));
    } else if (path.basename(file) === 'package.json' || path.basename(file) === '.package-lock.json') {
      result[rel] = digest(file);
    }
  }
  walk('node_modules');
  return result;
}

export function bindPreparedAsc(root) {
  assert.equal(root, path.resolve(root), 'Root must be absolute and normalized');
  directory(root);
  assert.equal(json(path.join(root, 'package.json')).name, 'pi-extensions-monorepo');
  const consumer = path.join(root, 'packages/pi-society-orchestrator');
  const source = path.join(root, 'packages/pi-autonomous-session-control');
  for (const dir of [path.join(root, 'packages'), consumer, source,
    path.join(consumer, 'node_modules'), path.join(consumer, 'node_modules/@tryinget')]) directory(dir);
  const manifest = json(path.join(source, 'package.json'));
  assert.equal(manifest.name, NAME);
  assert.equal(json(path.join(consumer, 'package.json')).name, '@tryinget/pi-society-orchestrator');
  assert.ok(json(path.join(consumer, 'package.json')).dependencies?.[NAME]);
  for (const [key, expected] of Object.entries({ '.': './extensions/self.ts',
    './execution': './dist/execution.js', './attachments': './dist/attachments.js' })) {
    assert.equal(manifest.exports?.[key], expected, `Unexpected ASC export ${key}`);
    const file = path.join(source, expected);
    assert.ok(fs.statSync(file).isFile(), `Unprepared ASC export ${key}`);
    assert.equal(fs.realpathSync(file), file, `Escaping ASC export ${key}`);
  }
  const sourceLock = json(path.join(source, 'package-lock.json'));
  assert.equal(sourceLock.lockfileVersion, 3);
  assert.equal(sourceLock.packages?.['']?.name, NAME);
  assert.equal(sourceLock.packages[''].version, manifest.version);
  const metadata = [path.join(root, 'package.json'), ...[consumer, source].flatMap((dir) =>
    ['package.json', 'package-lock.json'].map((name) => path.join(dir, name)))];
  const metadataBefore = metadata.map(digest);
  const lock = json(path.join(consumer, 'package-lock.json'));
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages?.['']?.name, '@tryinget/pi-society-orchestrator');
  assert.ok(lock.packages[ENTRY], 'Missing locked ASC entry');
  assert.equal(manifest.version, lock.packages[ENTRY].version, 'Source/locked ASC version mismatch');
  const entry = path.join(consumer, ENTRY);
  const stat = fs.lstatSync(entry);
  // An already-bound source link has its own prepared install. A registry
  // directory must have no local dependency subtree, even an empty/dangling one.
  if (!stat.isSymbolicLink()) {
    assert.equal(fs.lstatSync(path.join(entry, 'node_modules'), { throwIfNoEntry: false }),
      undefined, 'ASC-local node_modules must not be discarded');
  }
  // Check every installed locked version, including nested packages. Optional
  // platform packages may be absent; local links retain their source owner.
  for (const [rel, record] of Object.entries(lock.packages)) {
    if (!rel.startsWith('node_modules/') || rel === ENTRY) continue;
    assert.ok(!rel.split('/').includes('..') && !path.isAbsolute(rel), 'Unsafe lock path');
    const file = path.join(consumer, rel, 'package.json');
    if (!fs.existsSync(file) && record.optional) continue;
    const installed = json(file);
    if (!record.link) assert.equal(installed.version, record.version, `Locked version drift: ${rel}`);
  }
  assert.ok(fs.statSync(path.join(consumer, 'node_modules/.package-lock.json')).isFile());
  if (stat.isSymbolicLink()) assert.equal(fs.realpathSync(entry), source, 'Wrong existing ASC link');
  else {
    assert.ok(stat.isDirectory(), 'ASC entry must be package directory or exact source link');
    assert.equal(json(path.join(entry, 'package.json')).name, NAME);
    assert.equal(json(path.join(entry, 'package.json')).version, lock.packages[ENTRY].version);
  }
  directory(path.join(source, 'node_modules'));
  const before = snapshot(consumer);
  const sourceBefore = snapshot(source);
  let stage;
  let backedUp = false;
  let bound = false;
  try {
    if (!stat.isSymbolicLink()) {
      // Fresh private adjacent transaction directory; never reuse old state.
      // Keep the admitted original until all postconditions pass.
      stage = fs.mkdtempSync(path.join(path.dirname(entry), '.asc-ci-binding-'));
      fs.chmodSync(stage, 0o700);
      fs.symlinkSync(path.relative(path.dirname(entry), source), path.join(stage, 'prepared'), 'dir');
      fs.renameSync(entry, path.join(stage, 'original'));
      backedUp = true;
      fs.renameSync(path.join(stage, 'prepared'), entry);
      bound = true;
    }
    assert.equal(fs.realpathSync(entry), source);
    const require = createRequire(path.join(consumer, 'package.json'));
    assert.equal(fs.realpathSync(require.resolve(NAME)), path.join(source, 'extensions/self.ts'));
    for (const subpath of ['execution', 'attachments']) {
      assert.equal(fs.realpathSync(require.resolve(`${NAME}/${subpath}`)),
        path.join(source, `dist/${subpath}.js`));
    }
    assert.deepEqual(snapshot(consumer, stage), before, 'Installed closure or hidden lock changed');
    assert.deepEqual(snapshot(source), sourceBefore, 'Prepared source install changed');
    assert.deepEqual(metadata.map(digest), metadataBefore, 'Source manifest/lock changed');
  } catch (error) {
    try {
      if (bound) {
        assert.ok(fs.lstatSync(entry).isSymbolicLink(), 'Refusing rollback over changed entry');
        assert.equal(fs.realpathSync(entry), source, 'Refusing rollback over foreign link');
        fs.unlinkSync(entry);
      }
      if (backedUp) {
        assert.equal(fs.lstatSync(entry, { throwIfNoEntry: false }), undefined,
          'Refusing rollback over occupied entry');
        fs.renameSync(path.join(stage, 'original'), entry);
      }
    } catch (rollbackError) {
      // Preserve the original for manual recovery; never delete it on rollback failure.
      throw new AggregateError([error, rollbackError], `ASC rollback failed; retained state: ${stage}`);
    }
    if (stage) fs.rmSync(stage, { recursive: true });
    throw error;
  }
  if (stage) fs.rmSync(stage, { recursive: true });
  return { source, consumer, preservedEntries: Object.keys(before).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No path overrides accepted');
  console.log(JSON.stringify(bindPreparedAsc(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))));
}
