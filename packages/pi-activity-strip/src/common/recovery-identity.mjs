// ---
// summary: "Exact harness-qualified claimant identities for read-only recovery projections."
// read_when: ["changing recovery claimant joins"]
// ---

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIXES = /** @type {Record<string, string>} */ ({
  pi: "session-",
  claude: "claude-session-",
  codex: "codex-session-",
});

/** Unknown harnesses and non-UUID ids have no published AK claimant mapping.
 * @param {string} harness @param {string} id */
export function claimantFor(harness, id) {
  return Object.hasOwn(PREFIXES, harness) && UUID.test(id)
    ? `${PREFIXES[harness]}${id.toLowerCase()}`
    : null;
}

/** @param {unknown} value */
export function parseClaimant(value) {
  if (typeof value !== "string") return null;
  for (const [harness, prefix] of Object.entries(PREFIXES)) {
    if (!value.startsWith(prefix)) continue;
    const id = value.slice(prefix.length);
    if (UUID.test(id))
      return { harness, id: id.toLowerCase(), claimant: `${prefix}${id.toLowerCase()}` };
  }
  return null;
}

/** Strip publisher ids are explicitly namespaced; a bare UUID is Pi only.
 * @param {unknown} value */
export function publisherClaimant(value) {
  if (typeof value !== "string") return null;
  if (UUID.test(value)) return claimantFor("pi", value);
  const match = /^agent:([^:]+):(.+)$/.exec(value);
  return match ? claimantFor(match[1], match[2]) : null;
}
