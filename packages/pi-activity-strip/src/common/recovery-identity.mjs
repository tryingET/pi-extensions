// ---
// summary: "Exact harness-qualified claimant identities for read-only recovery projections."
// read_when: ["changing recovery claimant joins"]
// ---

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One base-36 field of a Nodecode id: uppercase with no leading zero, so one spelling each.
 * @param {string} field @param {number} least @param {number} most */
function base36Field(field, least, most) {
  return field.length >= least && field.length <= most && /^(?:0|[1-9A-Z][0-9A-Z]*)$/.test(field);
}

/** A decimal field of a Nodecode id, of at least `least`, in at most six digits.
 * @param {string} field @param {number} least */
function decimalField(field, least) {
  return /^[1-9][0-9]{0,5}$/.test(field) && Number(field) >= least;
}

/** @param {string} time @param {string} random */
function stamp(time, random) {
  return base36Field(time, 7, 8) && base36Field(random, 1, 10);
}

/** AK owns this grammar: valid_nodecode_session_id in agent-kernel crates/ak-core/src/tasks.rs.
 * A shell is `s-<random>`, a durable session `session-<time>-<random>`, a fork
 * `fork-turn-<time>-<random>-<n>` and one more number when that name is taken. `s-GATEWAY` is the
 * gateway's shared pseudo-session: it names no one session. Every other Nodecode id stays refused.
 * @param {unknown} id */
function validNodecodeId(id) {
  if (typeof id !== "string" || id === "s-GATEWAY") return false;
  const parts = id.split("-");
  if (parts[0] === "s" && parts.length === 2) return base36Field(parts[1], 1, 8);
  if (parts[0] === "session" && parts.length === 3) return stamp(parts[1], parts[2]);
  if (parts[0] !== "fork" || parts[1] !== "turn") return false;
  if (parts.length < 5 || parts.length > 6) return false;
  const [, , time, random, n, taken] = parts;
  return (
    stamp(time, random) && decimalField(n, 1) && (taken === undefined || decimalField(taken, 2))
  );
}

/** @param {string} id */
const lowercaseUuid = (id) => (UUID.test(id) ? id.toLowerCase() : null);
/** @param {string} id */
const exactNodecodeId = (id) => (validNodecodeId(id) ? id : null);

/** Each harness's AK prefix, and how its ids are spelled in a claimant (null: no such claimant).
 * A UUID folds to lowercase; a Nodecode id is case-exact, so it is kept or refused, never folded. */
const HARNESSES =
  /** @type {Record<string, {prefix: string; spell: (id: string) => string | null}>} */ ({
    pi: { prefix: "session-", spell: lowercaseUuid },
    claude: { prefix: "claude-session-", spell: lowercaseUuid },
    codex: { prefix: "codex-session-", spell: lowercaseUuid },
    nodecode: { prefix: "nodecode-session-", spell: exactNodecodeId },
  });

/** Unknown harnesses and ids outside a harness's form have no published AK claimant mapping.
 * @param {string} harness @param {string} id */
export function claimantFor(harness, id) {
  if (!Object.hasOwn(HARNESSES, harness)) return null;
  const { prefix, spell } = HARNESSES[harness];
  const spelled = spell(id);
  return spelled === null ? null : `${prefix}${spelled}`;
}

/** @param {unknown} value */
export function parseClaimant(value) {
  if (typeof value !== "string") return null;
  for (const [harness, { prefix, spell }] of Object.entries(HARNESSES)) {
    if (!value.startsWith(prefix)) continue;
    const id = spell(value.slice(prefix.length));
    if (id !== null) return { harness, id, claimant: `${prefix}${id}` };
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
