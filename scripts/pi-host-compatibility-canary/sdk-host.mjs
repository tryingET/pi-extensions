// Host closure BEFORE unshare/bwrap. Style of artifact-provision host_setup; pins from plan, live-checked.
// Empty env is not preload proof. Do not copy stale HOST_PINS identities.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
const need = (ok, message) => { if (!ok) throw new Error(`SDK plan: ${message}`); };
export const REQUIRED_HOST_ROLES = Object.freeze([
  'unshare', 'bwrap', 'loader', 'libc', 'ld.so.cache', 'python', 'node',
]);
export function liveHostIo() {
  return {
    getuid: () => process.getuid?.() ?? -1,
    geteuid: () => process.geteuid?.() ?? -1,
    getgid: () => process.getgid?.() ?? -1,
    getegid: () => process.getegid?.() ?? -1,
    lexists: path => { try { lstatSync(path); return true; } catch { return false; } },
    realpath: path => realpathSync(path),
    lstat: path => lstatSync(path),
    read: path => readFileSync(path),
  };
}
export function assertHostClosure(plan, io = liveHostIo()) {
  need(io.getuid() === 1000 && io.geteuid() === 1000 && io.getgid() === 1000 && io.getegid() === 1000,
    'numeric launcher identity uid/gid 1000');
  need(!io.lexists('/etc/ld.so.preload'), 'unexpected system preload');
  const pins = plan.hostPins;
  need(Array.isArray(pins) && pins.length === REQUIRED_HOST_ROLES.length, 'host pin set');
  const seen = new Set();
  for (const pin of pins) {
    need(REQUIRED_HOST_ROLES.includes(pin.role) && !seen.has(pin.role), `host pin role ${pin.role}`);
    seen.add(pin.role);
    if (pin.role === 'unshare') need(pin.path === '/usr/bin/unshare', 'fixed unshare path');
    if (pin.role === 'bwrap') need(pin.path === '/usr/bin/bwrap', 'fixed bwrap path');
    need(io.realpath(pin.path) === pin.resolved, `host alias resolution ${pin.role}`);
    const st = io.lstat(pin.resolved);
    const mode = st.mode & 0o7777;
    need(st.uid === pin.uid && st.gid === pin.gid && mode === pin.mode && st.size === pin.bytes,
      `host pin metadata ${pin.role}`);
    need(!(mode & 0o002), `host pin world-writable ${pin.role}`);
    need(createHash('sha256').update(io.read(pin.resolved)).digest('hex') === pin.sha256,
      `host pin digest ${pin.role}`);
  }
  need(seen.size === REQUIRED_HOST_ROLES.length, 'missing host pin role');
}
