// Synthetic mount/release predicates matching sdk_mounts.py / sdk_release.py. Unrun tests only.
export const PROC_COVERS = Object.freeze(['/proc/sys', '/proc/sysrq-trigger', '/proc/irq', '/proc/bus']);
const PROC_FLAGS = new Set(['ro', 'nosuid', 'nodev', 'noexec']);
const PROC_FORBIDDEN = new Set(['rw', 'suid', 'dev', 'exec']);
const DEV = /^(?:0|[1-9][0-9]{0,9}):(?:0|[1-9][0-9]{0,9})$/;
export function parseMountinfo(text) {
  const mounts = {};
  for (const line of text.split('\n').filter(Boolean)) {
    const [before, after] = line.trimEnd().split(' - ');
    const fields = before.split(' ');
    const rest = after.split(' ');
    const point = fields[4], options = fields[5].split(','), prop = fields.slice(6);
    if (prop.some(x => x.startsWith('shared:') || x.startsWith('master:') || x.startsWith('propagate_from:'))) {
      throw new Error('mount propagation');
    }
    mounts[point] = {
      fs: rest[0], options, super: (rest[2] ?? '').split(',').filter(Boolean),
      procRoot: fields[3], procDevice: fields[2],
    };
  }
  return mounts;
}
export function validateMounts(mounts, base) {
  const actual = new Set(Object.keys(mounts));
  const covers = new Set(PROC_COVERS);
  const unknown = [...actual].filter(p => !base.has(p) && !covers.has(p));
  const missing = [...base].filter(p => !actual.has(p));
  if (unknown.length || missing.length) {
    const bits = PROC_COVERS.reduce((n, p, i) => n | (actual.has(p) ? 1 << i : 0), 0);
    throw new Error(`mount surface ${bits} ${Math.min(unknown.length, 999)} ${Math.min(missing.length, 999)}`);
  }
  for (const [point, m] of Object.entries(mounts)) {
    const proc = point === '/proc' || covers.has(point);
    const desired = point === '/work' ? 'rw' : 'ro';
    if (!m.options.includes(desired) || m.options.includes(desired === 'rw' ? 'ro' : 'rw')) throw new Error('observed mount mode');
    if (proc) {
      if (m.fs !== 'proc' || [...PROC_FLAGS].some(f => !m.options.includes(f)) || m.options.some(f => PROC_FORBIDDEN.has(f))) {
        throw new Error('protective proc flags/type');
      }
      const expectedRoot = point === '/proc' ? '/' : point.slice(5);
      if (m.procRoot !== expectedRoot) throw new Error('protective proc root');
      if (!DEV.test(m.procDevice) || m.procDevice.split(':').some(v => Number(v) > 2 ** 32 - 1)) throw new Error('protective proc device syntax');
    } else if (m.fs === 'proc') throw new Error('unexpected proc filesystem');
  }
  for (const point of PROC_COVERS) {
    if (actual.has(point) && mounts[point].procDevice !== mounts['/proc'].procDevice) throw new Error('protective proc device mismatch');
  }
  if (mounts['/work']?.fs !== 'tmpfs') throw new Error('observed tmpfs');
  return true;
}
export function accumulateRelease(parts, attempt, maxLen) {
  const token = attempt + '\n';
  let buf = '';
  for (const part of parts) {
    if (part === null) return { ok: false, reason: buf ? 'release partial' : 'release EOF', keepOpen: true };
    buf += part;
    if (buf.length > maxLen) return { ok: false, reason: 'release oversize', keepOpen: true };
    if (buf.includes('\n')) {
      if (buf !== token) return { ok: false, reason: 'release token', keepOpen: true };
      return { ok: true, keepOpen: true };
    }
  }
  return { ok: false, reason: 'release incomplete', keepOpen: true };
}
