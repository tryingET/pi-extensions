#!/usr/bin/env node
// summary: Assert the existing CI toolchain lock before running commit-gate tests or builds.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
export function checkToolchain(lock, nodeVersion, npmVersion) {
  if (lock.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(lock.nodeVersion) || !/^\d+\.\d+\.\d+$/.test(lock.npmVersion)) {
    throw new Error('invalid policy/ci-toolchain-lock.json');
  }
  const issues = [];
  if (nodeVersion !== lock.nodeVersion) issues.push(`Node ${nodeVersion}; required Node ${lock.nodeVersion}`);
  if (npmVersion !== lock.npmVersion) issues.push(`npm ${npmVersion}; required npm ${lock.npmVersion}`);
  return issues;
}
if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  try {
    const lock = JSON.parse(fs.readFileSync(new URL('../policy/ci-toolchain-lock.json', import.meta.url)));
    const npm = spawnSync('npm', ['--version'], { encoding: 'utf8', timeout: 15000 });
    const issues = checkToolchain(lock, process.versions.node, npm.status === 0 ? npm.stdout.trim() : 'unavailable');
    if (issues.length) {
      console.error(`gate-toolchain: environment mismatch (no tests/builds started):\n- ${issues.join('\n- ')}`);
      console.error(`Use Node ${lock.nodeVersion} and npm ${lock.npmVersion} on PATH (policy/ci-toolchain-lock.json).`);
      console.error('Check `node --version` and `npm --version`; a Node distribution may bundle the wrong npm.');
      console.error('See docs/project/pre-push-inputs.md for isolated PATH setup. No automatic install was attempted.');
      process.exitCode = 1;
    } else console.log(`gate-toolchain: ok (Node ${lock.nodeVersion}, npm ${lock.npmVersion})`);
  } catch (error) {
    console.error(`gate-toolchain: ${error.message}`);
    process.exitCode = 1;
  }
}
