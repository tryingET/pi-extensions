// Pre-tag retained consumer identity. No registry availability/publication claim.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ASC_CONSUMER_PATH, ASC_SOURCE_PATH, ascArtifactHashes } from '../packages/pi-society-orchestrator/src/runtime/asc-candidate-artifact.ts';
export function prepareConsumerArtifact(root, directory) {
  assert(process.env.TMPDIR, 'Owned TMPDIR required for retained consumer build');
  fs.mkdirSync(directory, { recursive: true });
  assert.equal(fs.readdirSync(directory).length, 0, 'Consumer artifact directory must start empty');
  const build = fs.mkdtempSync(path.join(process.env.TMPDIR, 'asc-consumer-build-'));
  const run = (command, args, cwd = build) => execFileSync(command, args, {
    cwd, env: { ...process.env, GITHUB_SHA: '', PI_ASC_CANDIDATE_RECEIPT: '' },
    stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024,
  });
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    // Local clone supplies read-only commit identity to existing portable-README
    // prepack hooks. No commit, tag, push, or source-owner mutation is performed.
    run('git', ['clone', '--shared', '--no-checkout', root, build], root);
    run('git', ['checkout', '--detach', head]);
    // Actual prepared inputs, including the generated future owner, go into the
    // isolated build. The final qualifier will require these bytes in HEAD.
    const files = execFileSync('git', ['ls-files', '-z', '--', ASC_CONSUMER_PATH, ASC_SOURCE_PATH], { cwd: root })
      .toString().split('\0').filter(Boolean);
    for (const file of files) fs.copyFileSync(path.join(root, file), path.join(build, file));
    process.stdout.write(run('npm', ['ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], path.join(build, ASC_CONSUMER_PATH)));
    process.stdout.write(run(process.execPath, [path.join(build, 'scripts/release-artifact.mjs'), 'pack',
      '--package-path', ASC_CONSUMER_PATH, '--artifact-dir', directory]));
    const file = fs.readdirSync(directory).find(name => name.endsWith('.manifest.json'));
    assert(file, 'Consumer packing omitted manifest');
    const record = JSON.parse(fs.readFileSync(path.join(directory, file)));
    return { name: record.package.name, version: record.package.version,
      relativePath: record.artifact.relativePath,
      ...ascArtifactHashes(fs.readFileSync(path.join(directory, record.artifact.relativePath))) };
  } finally { fs.rmSync(build, { recursive: true, force: true }); }
}
