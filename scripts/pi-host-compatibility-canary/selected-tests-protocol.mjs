import { isAbsolute } from 'node:path';

/** Strict, observed wire dialects; NOT major-version ranges or inferred fallbacks.
 * Both versions require enqueue/dequeue/complete/start/pass for each body, plus
 * file/global summaries, wrapper completion and global plan. No invented phases.
 * v22.22.2 has no entryFile/testId/parentId/tags: identity is source file, exact
 * name and source location. The (file-as-name, line=1, column=1) wrapper tuple is
 * reserved: an indistinguishable real body causes duplicate-wrapper rejection.
 * v26.8.1 uses entryFile + testId, checked against source/name/location/parentId.
 * Source-file mismatches, suites, nesting and mixed proof-bearing dialects fail.
 * This establishes Node body selection, not assertion quality or SDK behavior.
 */
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x1f\x7f]/u.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function assertSupportedNode(version = process.version) {
  check(version === 'v22.22.2' || version === 'v26.8.1', 'unsupported Node event protocol: ' + version);
  return version;
}

export function exactPattern(names) {
  check(Array.isArray(names) && names.length > 0 && names.every(text), 'invalid test names');
  check(new Set(names).size === names.length, 'duplicate test names');
  // (?![\s\S]) is an absolute end anchor, unlike $ before a final newline.
  return `^(?:${names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\s\\S])`;
}

/** Reconcile real structured events, never console/TAP text. Exported for corruption tests. */
export function reconcileEvents(events, { file, names }, version = process.version) {
  const node22 = assertSupportedNode(version) === 'v22.22.2';
  const wrapperIdentity = d => d.name === file && d.line === 1 && d.column === 1;
  exactPattern(names);
  check(text(file) && isAbsolute(file), 'invalid event inventory file');
  check(Array.isArray(events) && events.length > 0, 'missing events');
  const records = new Map();
  const seenNames = new Set();
  const testNumbers = new Set();
  const wrapper = new Set();
  let fileSummary = false;
  let globalSummary = false;
  let plan = false;
  let filePlan = false;
  const phases = new Set(['test:enqueue', 'test:dequeue', 'test:complete', 'test:start', 'test:pass']);
  const summaries = data => {
    check(data.success === true && object(data.counts), 'failed/malformed summary');
    for (const [key, expected] of Object.entries({ tests: names.length, passed: names.length,
      topLevel: names.length, failed: 0, cancelled: 0, skipped: 0, todo: 0, suites: 0 })) {
      check(data.counts[key] === expected, `summary mismatch: ${key}`);
    }
    check(Number.isFinite(data.duration_ms) && data.duration_ms >= 0, 'invalid summary duration');
  };
  for (const event of events) {
    check(object(event) && typeof event.type === 'string' && object(event.data), 'malformed event');
    check(!globalSummary, 'events after global summary');
    const { type, data: d } = event;
    if (node22) check(!['entryFile', 'testId', 'parentId', 'tags'].some(key => own(d, key)), 'mixed Node event protocols');
    const body = node22
      ? (phases.has(type) ? !wrapperIdentity(d) : own(d, 'file'))
      : own(d, 'entryFile');
    if (!node22 && body) check(d.entryFile === file, 'unexpected entryFile');
    if (own(d, 'file')) check(d.file === file, 'unexpected source file');
    if (type === 'test:fail') throw new Error(`child test failure: ${d.name}`);
    for (const value of [d, d.details ?? {}]) {
      check(object(value), 'malformed details');
      check(!['skip', 'todo', 'cancelled', 'error'].some(key => own(value, key)), 'skip/todo/cancel/error');
      check(!own(value, 'passed') || value.passed === true, 'unsuccessful/contradictory result');
    }
    if (type === 'test:stdout' || type === 'test:stderr' || type === 'test:diagnostic') {
      check(typeof d.message === 'string', 'malformed diagnostic/output');
      if (type !== 'test:diagnostic') check(body && d.file === file, 'malformed output scope');
      continue; // Deliberately never parse message text as proof.
    }
    if (type === 'test:summary') {
      summaries(d);
      if (body) {
        check(!fileSummary && d.file === file, 'duplicate/malformed file summary');
        check(records.size === names.length && [...records.values()].every(r => r.phases.size === 5),
          'incomplete selected body lifecycles');
        fileSummary = true;
      } else {
        check(!own(d, 'file') && fileSummary && plan && wrapper.size === 3,
          'incomplete wrapper/plan/summaries');
        globalSummary = true;
      }
      continue;
    }
    if (type === 'test:plan') {
      check(d.nesting === 0 && d.count === names.length, 'unexpected plan');
      if (body) {
        check(!filePlan && !fileSummary, 'duplicate/late file plan');
        filePlan = true;
      } else {
        check(!own(d, 'file') && !plan && fileSummary && wrapper.has('test:complete'),
          'duplicate/malformed global plan');
        plan = true;
      }
      continue;
    }
    check(phases.has(type), `unsupported event: ${type}`);
    check(text(d.name) && d.file === file && d.nesting === 0
      && (node22 || (d.parentId === 0 && integer(d.testId) && d.testId > 0))
      && integer(d.line) && d.line > 0
      && integer(d.column) && d.column > 0, 'malformed or unsupported nesting/identity');
    if (type === 'test:enqueue' || type === 'test:dequeue') {
      check(d.type === 'test', 'suites unsupported');
    }
    if (type === 'test:complete' || type === 'test:pass') {
      check(object(d.details) && d.details.type === 'test' && integer(d.testNumber) && d.testNumber > 0
        && Number.isFinite(d.details.duration_ms) && d.details.duration_ms >= 0, 'malformed result');
      if (type === 'test:complete') check(d.details.passed === true, 'unsuccessful completion');
    }
    if (!body) {
      check(wrapperIdentity(d) && (node22 || d.testId === 1)
        && ['test:enqueue', 'test:dequeue', 'test:complete'].includes(type), 'file wrapper is not body proof');
      check(!wrapper.has(type), 'duplicate wrapper event');
      if (type === 'test:dequeue') check(wrapper.has('test:enqueue'), 'incomplete wrapper');
      if (type === 'test:complete') check(wrapper.has('test:dequeue') && fileSummary
        && d.testNumber === 1, 'incomplete/malformed wrapper');
      wrapper.add(type);
      continue;
    }
    check(!fileSummary && wrapper.has('test:dequeue'), 'late/unscoped body event');
    check(names.includes(d.name), `unexpected body: ${d.name}`);
    const key = node22 ? JSON.stringify([d.name, d.line, d.column]) : d.testId;
    if (type === 'test:enqueue') {
      check(!records.has(key) && !seenNames.has(d.name), `duplicate selected body: ${d.name}`);
      records.set(key, { name: d.name, line: d.line, column: d.column, phases: new Set() });
      seenNames.add(d.name);
    }
    const record = records.get(key);
    check(record && record.name === d.name && record.line === d.line && record.column === d.column,
      'missing/mismatched body identity');
    check(!record.phases.has(type), 'duplicate body lifecycle event');
    if (type !== 'test:enqueue') check(record.phases.has('test:enqueue'), 'missing enqueue');
    if (type === 'test:start') check(record.phases.has('test:dequeue'), 'missing dequeue before start');
    if (type === 'test:complete') {
      check(record.phases.has('test:dequeue'), 'missing dequeue');
      check(!testNumbers.has(d.testNumber) && d.testNumber <= names.length, 'invalid/duplicate body number');
      testNumbers.add(d.testNumber);
      record.testNumber = d.testNumber;
    }
    if (type === 'test:pass') check(record.phases.has('test:complete') && record.phases.has('test:start')
      && record.testNumber === d.testNumber, 'incomplete/mismatched result');
    record.phases.add(type);
  }
  check(globalSummary && seenNames.size === names.length, 'incomplete/zero/partial selection');
  return { file, selected: seenNames.size, names: [...seenNames] };
}

