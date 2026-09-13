// Concrete bounded graph state used by real synchronous hooks and synthetic regressions.
// The v1 consumption capability remains unchanged; v2 is not a new generic loader API.
import { sha, same, need, urlPath, packageEdge, verifyPackage } from './sdk-plan.mjs';
export const edgeKey = e => JSON.stringify([e.parent, e.specifier, [...e.conditions].sort()]);
export function graphState(plan, realm, emit, inspect = true) {
  const nodes = new Map(realm.nodes.map(n => [n.url, n]));
  const edges = new Map(realm.edges.map(e => [edgeKey(e), e]));
  const resolved = new Map(), loaded = new Map();
  const allowCjs = (plan.mechanisms ?? []).includes('cjs');
  let denial, ended = false;
  function deny(reason) {
    denial ??= String(reason);
    emit({ kind: 'deny', reason: denial });
    throw new Error(`SDK consumption denied: ${denial}`);
  }
  function guard(operation) {
    if (denial || ended) return deny(denial ?? 'import after realm end');
    try { return operation(); } catch (error) { return deny(error.message); }
  }
  return Object.freeze({
    resolve(specifier, context, nextResolve) {
      return guard(() => {
        need(!Object.keys(context.importAttributes ?? {}).length, 'import attributes require separate qualification');
        if ((context.conditions ?? []).includes('require')) need(allowCjs, 'CJS/createRequire requires plan.mechanisms cjs');
        const key = edgeKey({ parent: context.parentURL ?? '', specifier, conditions: context.conditions });
        const edge = edges.get(key); need(edge, `unapproved importing module/specifier/conditions: ${key}`);
        if (edge.parent) need(loaded.has(edge.parent), 'unverified importing module');
        if (inspect) { packageEdge(plan, edge); if (edge.packageRoot) verifyPackage(plan, edge.packageRoot); }
        const result = nextResolve(specifier, context);
        need(result.url === edge.url, 'canonical resolution mismatch');
        if (!edge.url.startsWith('node:') && inspect) urlPath(result.url);
        const count = (resolved.get(key) ?? 0) + 1; resolved.set(key, count);
        emit({ kind: 'resolve', key, url: result.url, count });
        return result;
      });
    },
    load(url, context, nextLoad) {
      return guard(() => {
        const node = nodes.get(url);
        need(node || url.startsWith('node:'), 'unapproved load URL');
        const attribution = realm.edges.filter(e => e.url === url && resolved.has(edgeKey(e)));
        need(attribution.length > 0, 'load has no observed approved edge');
        const result = nextLoad(url, context);
        if (url.startsWith('node:')) { need(result.format === 'builtin', 'builtin format'); return result; }
        need(!loaded.has(url), 'duplicate cold load');
        const sourceOk = typeof result.source === 'string' || result.source instanceof Uint8Array;
        if (result.format === 'commonjs') {
          need(allowCjs && node.format === 'commonjs' && sourceOk, 'unqualified CJS/loader output');
        } else {
          need(result.format === 'module' && node.format === 'module' && sourceOk, 'unqualified CJS/TS/loader output');
        }
        need(sha(result.source) === node.sourceSha256, 'final executable bytes changed');
        if (inspect) { urlPath(url); verifyPackage(plan, node.packageRoot); }
        loaded.set(url, node.sourceSha256);
        emit({ kind: 'load', url, sha256: node.sourceSha256, format: result.format });
        return result;
      });
    },
    end(natural) {
      return guard(() => {
        need(natural, 'explicit exit or incomplete lifecycle');
        need(nodes.size === loaded.size && [...nodes.keys()].every(k => loaded.has(k)), 'missing cold loads');
        need(edges.size === resolved.size && [...edges.keys()].every(k => resolved.has(k)), 'missing required edges');
        for (const edge of edges.values()) need(edge.url.startsWith('node:') || loaded.has(edge.url), 'resolve-only/warm-cache');
        ended = true;
        return { kind: 'end', complete: true, loads: loaded.size, edges: resolved.size };
      });
    },
  });
}
