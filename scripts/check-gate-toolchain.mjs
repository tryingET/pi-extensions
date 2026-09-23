#!/usr/bin/env node
// summary: Assert the existing CI toolchain lock before running commit-gate tests or builds.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const VERSION = /^\d+\.\d+\.\d+$/;

// The pinned lane certifies commits. The advisory `next` lane (PI_GATE_NODE_LANE=next) proves the
// following Node line ahead of a pin move; it never admits a pre-push or release gate on its own.
export function expectedNodeVersion(lock, lane = 'pinned') {
  if (lane === 'pinned') return lock.nodeVersion;
  if (lane === 'next' && VERSION.test(lock.nextNodeVersion ?? '')) return lock.nextNodeVersion;
  throw new Error(`unknown or unconfigured Node lane: ${lane}`);
}

export function checkToolchain(lock, nodeVersion, npmVersion, lane = 'pinned') {
  if (lock.schemaVersion !== 1 || !VERSION.test(lock.nodeVersion) || !VERSION.test(lock.npmVersion)) {
    throw new Error('invalid policy/ci-toolchain-lock.json');
  }
  const node = expectedNodeVersion(lock, lane);
  const issues = [];
  if (nodeVersion !== node) issues.push(`Node ${nodeVersion}; required Node ${node}`);
  if (npmVersion !== lock.npmVersion) issues.push(`npm ${npmVersion}; required npm ${lock.npmVersion}`);
  return issues;
}
if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  try {
    const lock = JSON.parse(fs.readFileSync(new URL('../policy/ci-toolchain-lock.json', import.meta.url)));
    const lane = process.env.PI_GATE_NODE_LANE || 'pinned';
    const node = expectedNodeVersion(lock, lane);
    const npm = spawnSync('npm', ['--version'], { encoding: 'utf8', timeout: 15000 });
    const issues = checkToolchain(lock, process.versions.node, npm.status === 0 ? npm.stdout.trim() : 'unavailable', lane);
    if (issues.length) {
      console.error(`gate-toolchain: environment mismatch (no tests/builds started):\n- ${issues.join('\n- ')}`);
      console.error(`Use Node ${node} and npm ${lock.npmVersion} on PATH (policy/ci-toolchain-lock.json).`);
      console.error(`An installed Node ${node} is picked up automatically from PI_GATE_NODE_BIN or ~/.local/opt/node-v${node}-<platform>/bin/node.`);
      console.error('Check `node --version` and `npm --version`; a Node distribution may bundle the wrong npm.');
      console.error('See docs/project/pre-push-inputs.md for isolated PATH setup. No automatic install was attempted.');
      process.exitCode = 1;
    } else console.log(`gate-toolchain: ok (Node ${node}, npm ${lock.npmVersion}${lane === 'pinned' ? '' : `, ${lane} lane`})`);
  } catch (error) {
    console.error(`gate-toolchain: ${error.message}`);
    process.exitCode = 1;
  }
}
