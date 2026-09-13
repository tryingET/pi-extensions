// Reconciles ONLY after namespace PID1 ECHILD + direct status + all output EOF.
import { sha, need } from './sdk-plan.mjs';
import { edgeKey } from './sdk-graph.mjs';
function childName(id) { return sha(id) + '.child.jsonl'; }
export function reconcileGraphReceipts(plan, binding, settlement, wires) {
  need(settlement?.allChildrenSettled === true && settlement.directStatusObserved === true &&
    settlement.outputEOF === true && settlement.termination === false &&
    settlement.supervisorNamespace === binding.supervisorNamespace, 'outer settlement/EOF unknown');
  const required = plan.scenario?.requiredOwners ?? [];
  const children = plan.children ?? [];
  need(Array.isArray(wires), 'wires');
  const realmWires = wires.filter(w => !w.name.endsWith('.child.jsonl'));
  const childWires = wires.filter(w => w.name.endsWith('.child.jsonl'));
  need(realmWires.length === plan.realms.length, 'missing/extra child receipt');
  need(childWires.length === children.length, 'child without receipt HOLD');
  const owners = new Set(), incarnations = new Set(), names = new Set();
  const results = [];
  for (const { name, wire } of realmWires) {
    need(!names.has(name), 'duplicate receipt'); names.add(name);
    need(typeof wire === 'string' && Buffer.byteLength(wire) <= plan.limits.outputBytes && wire.endsWith('\n'), 'truncated receipt');
    const rows = wire.slice(0, -1).split('\n').map(line => JSON.parse(line));
    need(rows.length >= 3 && rows.every((r, i) => r.seq === i), 'missing/duplicate/reordered receipt sequence');
    const first = rows.shift(), end = rows.pop();
    need(first.kind === 'begin' && end.kind === 'end' && end.complete === true, 'missing/late end');
    need(first.planSha256 === binding.planSha256 && first.runId === binding.runId &&
      first.attempt === binding.attempt && first.scenario === binding.scenario &&
      first.node === plan.nodeVersion, 'plan/run/scenario/attempt mismatch');
    const realm = plan.realms.find(r => r.file === first.file);
    need(realm && name === sha(realm.file) + '.jsonl', 'unexpected realm filename');
    const id = first.incarnation;
    need(Number.isSafeInteger(id?.pid) && id.pid > 1 && /^\d+$/.test(id.start) &&
      id.namespace === binding.supervisorNamespace, 'process incarnation/namespace');
    const key = JSON.stringify(id); need(!incarnations.has(key), 'duplicate process incarnation'); incarnations.add(key);
    const loaded = new Map(), resolved = new Map();
    for (const event of rows) {
      need(event.kind === 'resolve' || event.kind === 'load', 'sticky denial/unknown/duplicate begin');
      if (event.kind === 'resolve') {
        const edge = realm.edges.find(e => edgeKey(e) === event.key);
        need(edge && edge.url === event.url && event.count === (resolved.get(event.key) ?? 0) + 1,
          'unapproved/reordered resolve');
        if (edge.parent) need(loaded.has(edge.parent), 'parent not cold loaded in this realm');
        resolved.set(event.key, event.count);
      } else {
        const node = realm.nodes.find(n => n.url === event.url);
        need(node && event.sha256 === node.sourceSha256 && !loaded.has(event.url) &&
          realm.edges.some(e => e.url === event.url && resolved.has(edgeKey(e))), 'unattributed/duplicate/tampered load');
        loaded.set(event.url, event.sha256);
      }
    }
    need(loaded.size === realm.nodes.length && resolved.size === realm.edges.length &&
      end.loads === loaded.size && end.edges === resolved.size, 'missing cold consumption');
    for (const edge of realm.edges) {
      need(edge.url.startsWith('node:') || loaded.has(edge.url), 'resolve-only claim');
      const pkg = plan.packages.find(p => p.root === edge.packageRoot);
      if (pkg && required.includes(pkg.name) && loaded.has(edge.url)) owners.add(pkg.name);
    }
    results.push({ file: realm.file, incarnation: id, sha256: sha(wire), loads: loaded.size });
  }
  const childSeen = new Set();
  for (const { name, wire } of childWires) {
    need(!names.has(name), 'duplicate receipt'); names.add(name);
    need(typeof wire === 'string' && wire.endsWith('\n'), 'truncated child receipt');
    const rows = wire.slice(0, -1).split('\n').map(line => JSON.parse(line));
    const first = rows[0], end = rows[rows.length - 1];
    need(first?.kind === 'child-begin' && end?.kind === 'child-end' && end.complete === true, 'child receipt incomplete');
    const child = children.find(c => childName(c.id) === name);
    need(child && first.id === child.id && first.attempt === binding.attempt, 'unexpected child receipt');
    need(!childSeen.has(child.id), 'duplicate child receipt'); childSeen.add(child.id);
    need(JSON.stringify(first.argv) === JSON.stringify(child.argv) && first.cwd === child.cwd &&
      first.executableSha256 === child.executableSha256, 'child argv/cwd/bytes mismatch');
  }
  need(children.every(c => childSeen.has(c.id)), 'child without receipt HOLD');
  need(required.every(o => owners.has(o)), 'required scenario owners not consumed (compile-only is not runtime)');
  return { schema: 'root-canary-sdk-reconciliation-v2', binding, realms: results,
    owners: [...owners].sort(), campaignOwners: plan.campaignOwners ?? [],
    scope: 'reviewed graph, not API assertion quality' };
}
