// summary: NUL-safe Git-index file selection for repository gates; never falls back to a filesystem walk.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export function assertNoSymlinkParents(root, file) {
  let dir = path.dirname(file);
  while (dir !== root) {
    if (dir === path.dirname(dir)) throw new Error('source path escapes audit root');
    if (fs.lstatSync(dir).isSymbolicLink()) throw new Error(`tracked source has symlinked parent: ${dir}`);
    dir = path.dirname(dir);
  }
}


export function trackedFiles(root) {
  try {
    // --full-name is deliberately absent: paths are relative to the selected subtree.
    return execFileSync('git', ['-C', root, 'ls-files', '--cached', '-z', '--', '.'], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\0').filter(Boolean).map(name => path.resolve(root, name));
  } catch (error) {
    throw new Error(`cannot enumerate tracked files under ${root}: ${error.message}`);
  }
}
