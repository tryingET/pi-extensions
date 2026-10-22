import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bindPreparedAsc } from './bind-prepared-asc-ci.mjs';

const NAME = '@tryinget/pi-autonomous-session-control';
function fixture(t) {
  const base = process.env.PI_EXTENSIONS_TMPDIR || process.env.TMPDIR || path.join(os.homedir(), '.local/state/pi-quests/tmp');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(base, 'asc-binding-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const consumer = path.join(root, 'packages/pi-society-orchestrator');
  const source = path.join(root, 'packages/pi-autonomous-session-control');
  const entry = path.join(consumer, 'node_modules', NAME);
  function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  }
  write(path.join(root, 'package.json'), { name: 'pi-extensions-monorepo' });
  fs.mkdirSync(path.join(source, 'node_modules'), { recursive: true });
  write(path.join(consumer, 'package.json'), { name: '@tryinget/pi-society-orchestrator', dependencies: { [NAME]: '^0.7.0' } });
  write(path.join(source, 'package.json'), { name: NAME, version: '0.7.0', exports: {
    '.': './extensions/self.ts', './execution': './dist/execution.js', './attachments': './dist/attachments.js',
  } });
  write(path.join(source, 'package-lock.json'), { lockfileVersion: 3, packages: { '': { name: NAME, version: '0.7.0' } } });
  for (const file of ['extensions/self.ts', 'dist/execution.js', 'dist/attachments.js']) write(path.join(source, file), 'export {};');
  write(path.join(entry, 'package.json'), { name: NAME, version: '0.7.0' });
  const packages = { '': { name: '@tryinget/pi-society-orchestrator' }, [`node_modules/${NAME}`]: { version: '0.7.0' } };
  for (const [rel, version] of [['node_modules/codemode', '1.1.0'], ['node_modules/a/node_modules/b', '2.0.0']]) {
    packages[rel] = { version };
    write(path.join(consumer, rel, 'package.json'), { version });
  }
  write(path.join(consumer, 'package-lock.json'), { lockfileVersion: 3, packages });
  const hidden = path.join(consumer, 'node_modules/.package-lock.json');
  write(hidden, JSON.stringify({ lockfileVersion: 3, packages }));
  return { root, consumer, source, entry, write, hidden };
}

test('bind preserves full locked versions, nested manifests, metadata and hidden lock bytes; idempotent', (t) => {
  const f = fixture(t);
  const files = [f.hidden, ...[f.consumer, f.source].flatMap((dir) => ['package.json', 'package-lock.json'].map((name) => path.join(dir, name))),
    path.join(f.consumer, 'node_modules/codemode/package.json'), path.join(f.consumer, 'node_modules/a/node_modules/b/package.json')];
  const before = files.map((file) => fs.readFileSync(file));
  bindPreparedAsc(f.root);
  assert.equal(fs.realpathSync(f.entry), f.source);
  bindPreparedAsc(f.root);
  assert.deepEqual(files.map((file) => fs.readFileSync(file)), before);
});

for (const [name, damage] of [
  ['missing build', (f) => fs.unlinkSync(path.join(f.source, 'dist/execution.js'))],
  ['changed export', (f) => { const file = path.join(f.source, 'package.json'); const m = JSON.parse(fs.readFileSync(file)); m.exports['./execution'] = './other.js'; f.write(file, m); }],
  ['locked transitive drift', (f) => f.write(path.join(f.consumer, 'node_modules/codemode/package.json'), { version: '1.2.0' })],
  ['nested locked drift', (f) => f.write(path.join(f.consumer, 'node_modules/a/node_modules/b/package.json'), { version: '3.0.0' })],
  ['missing hidden lock', (f) => fs.unlinkSync(f.hidden)],
  ['wrong root', (f) => f.write(path.join(f.root, 'package.json'), { name: 'other' })],
  ['wrong consumer', (f) => f.write(path.join(f.consumer, 'package.json'), { name: 'other' })],
  ['wrong source', (f) => f.write(path.join(f.source, 'package.json'), { name: 'other' })],
  ['escaping scope', (f) => { fs.renameSync(path.dirname(f.entry), path.join(f.root, 'scope')); fs.symlinkSync(path.join(f.root, 'scope'), path.dirname(f.entry)); }],
  ['wrong existing link', (f) => { fs.rmSync(f.entry, { recursive: true }); fs.symlinkSync(f.root, f.entry); }],
]) test(`refuses ${name} before binding`, (t) => {
  const f = fixture(t);
  damage(f);
  const before = fs.lstatSync(f.entry).isSymbolicLink() ? fs.readlinkSync(f.entry) : fs.readFileSync(path.join(f.entry, 'package.json'), 'utf8');
  assert.throws(() => bindPreparedAsc(f.root));
  assert.equal(fs.lstatSync(f.entry).isSymbolicLink() ? fs.readlinkSync(f.entry) : fs.readFileSync(path.join(f.entry, 'package.json'), 'utf8'), before);
});

// Byte-complete fixture inventory, including dangling links and empty directories.
function allBytes(root) {
  const result = {};
  function walk(file, rel) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) result[rel] = ['link', fs.readlinkSync(file)];
    else if (stat.isDirectory()) {
      result[rel] = ['directory'];
      for (const name of fs.readdirSync(file).sort()) walk(path.join(file, name), path.join(rel, name));
    } else result[rel] = ['file', fs.readFileSync(file).toString('base64')];
  }
  walk(root, '.');
  return result;
}

for (const kind of ['locked dependency', 'empty directory', 'file', 'symlink', 'dangling symlink']) {
  test(`refuses ASC-local node_modules ${kind}, preserving ALL fixture bytes`, (t) => {
    const f = fixture(t);
    const local = path.join(f.entry, 'node_modules');
    if (kind === 'locked dependency') {
      const rel = `node_modules/${NAME}/node_modules/nested`;
      f.write(path.join(f.consumer, rel, 'package.json'), { name: 'nested', version: '1.0.0' });
      f.write(path.join(f.consumer, rel, 'payload.bin'), '\u0000keep\u00ff');
      for (const file of [path.join(f.consumer, 'package-lock.json'), f.hidden]) {
        const lock = JSON.parse(fs.readFileSync(file));
        lock.packages[rel] = { version: '1.0.0' };
        f.write(file, lock);
      }
    } else if (kind === 'empty directory') fs.mkdirSync(local);
    else if (kind === 'file') f.write(local, 'not a directory');
    else fs.symlinkSync(kind === 'symlink' ? path.join(f.source, 'node_modules') : path.join(f.root, 'absent'), local);
    const before = allBytes(f.root);
    assert.throws(() => bindPreparedAsc(f.root), /ASC-local node_modules/);
    assert.deepEqual(allBytes(f.root), before);
  });
}

for (const point of ['prepare link', 'backup rename', 'binding rename', 'postcondition']) {
  test(`ordinary failure at ${point} restores ALL fixture bytes`, (t) => {
    const f = fixture(t);
    f.write(path.join(f.entry, 'registry-payload.bin'), 'keep original');
    // An occupied lookalike is not ours to reuse or remove.
    f.write(path.join(path.dirname(f.entry), '.asc-ci-binding-foreign/keep'), 'unowned');
    const before = allBytes(f.root);
    const originalRename = fs.renameSync;
    const originalLink = fs.symlinkSync;
    const originalRead = fs.readFileSync;
    let injected = false;
    const fail = () => { injected = true; throw new Error(`injected ${point}`); };
    fs.symlinkSync = (...args) => {
      if (point === 'prepare link' && !injected) fail();
      return originalLink(...args);
    };
    fs.renameSync = (...args) => {
      if (!injected && ((point === 'backup rename' && args[0] === f.entry) ||
        (point === 'binding rename' && path.basename(args[0]) === 'prepared'))) fail();
      return originalRename(...args);
    };
    fs.readFileSync = (...args) => {
      if (!injected && point === 'postcondition' && args[0] === f.hidden && fs.lstatSync(f.entry).isSymbolicLink()) fail();
      return originalRead(...args);
    };
    try {
      assert.throws(() => bindPreparedAsc(f.root), new RegExp(`injected ${point}`));
    } finally {
      fs.renameSync = originalRename;
      fs.symlinkSync = originalLink;
      fs.readFileSync = originalRead;
    }
    assert.ok(injected);
    assert.deepEqual(allBytes(f.root), before);
  });
}

test('rollback failure retains original backup rather than deleting recovery state', (t) => {
  const f = fixture(t);
  f.write(path.join(f.entry, 'registry-payload.bin'), 'recover me');
  const originalBytes = allBytes(f.entry);
  const rename = fs.renameSync;
  let backup;
  fs.renameSync = (from, to) => {
    if (from === f.entry) { backup = to; return rename(from, to); }
    throw new Error('injected binding/rollback rename failure');
  };
  try {
    assert.throws(() => bindPreparedAsc(f.root), (error) =>
      error instanceof AggregateError && /retained state:/.test(error.message));
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(allBytes(backup), originalBytes);
  assert.equal(fs.lstatSync(f.entry, { throwIfNoEntry: false }), undefined);
});
