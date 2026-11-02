// summary: immutable declared-scope closeout state and deterministic refusal rules.
// read_when: changing closeout obligations, dispositions, or certificate freshness.
import { createHash, randomUUID } from "node:crypto";

export const CLOSEOUT_ENTRY = "pi.session-closeout.v1";
export const CLOSEOUT_TOOL = "session_closeout";
export type Disposition = "resolved" | "deferred" | "retained";
export interface HostIdentity {
  sessionId: string;
  sessionFile: string;
  cwd: string;
  repo: string;
}
export interface Obligation {
  id: string;
  title: string;
  acceptance: string;
  repo: string;
  kind: "work" | "retained";
}
export interface Binding {
  id: string;
  disposition: Disposition;
  taskId?: number;
  evidenceId?: number;
  rationale: string;
}
export type BudgetProfile = "default" | "large-assets";
export interface CloseoutState {
  schema: 1;
  id: string;
  host: HostIdentity;
  boundary: string | null;
  revision: number;
  obligations: Obligation[];
  bindings: Binding[];
  frozenDigest?: string;
  budget?: { profile: BudgetProfile; rationale: string; revision: number };
  receipt?: {
    id: string;
    at: string;
    digest: string;
    work: "COMPLETE" | "INCOMPLETE";
    session: "SAFE_TO_CLOSE";
    reviewer: "operator-confirmation";
    coverage: "operator-reviewed declared obligations; not exhaustive process discovery";
  };
}
export interface Observation {
  id: string;
  disposition: Disposition | "open";
  valid: boolean;
  reason: string;
  facts: unknown;
  validUntil?: number;
}
export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function text(value: unknown, label: string, max = 2000): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code === 127 || (code < 32 && code !== 9 && code !== 10);
    })
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value.trim();
}
export function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
export function openState(host: HostIdentity, boundary: string | null): CloseoutState {
  return {
    schema: 1,
    id: randomUUID(),
    host,
    boundary,
    revision: 1,
    obligations: [],
    bindings: [],
  };
}
/** Fixed reader resources, never an approval or a change to the frozen inventory. */
export function budgetLimits(profile: unknown): {
  profile: BudgetProfile;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
} {
  if (profile !== "default" && profile !== "large-assets")
    throw new Error("Unknown closeout budget profile; use default or large-assets");
  return {
    profile,
    maxFileBytes: (profile === "default" ? 2 : 64) * 1024 * 1024,
    maxTotalBytes: (profile === "default" ? 20 : 512) * 1024 * 1024,
    maxFiles: 1000,
  };
}
export function closeoutBudget(state: CloseoutState) {
  const selected = state.budget;
  if (selected !== undefined) {
    if (
      !selected ||
      typeof selected !== "object" ||
      Array.isArray(selected) ||
      Object.keys(selected).sort().join(",") !== "profile,rationale,revision" ||
      !positive(selected.revision) ||
      selected.revision > state.revision
    )
      throw new Error("Malformed closeout budget profile");
    text(selected.rationale, "budget rationale");
  }
  return {
    ...budgetLimits(selected === undefined ? "default" : selected.profile),
    repo: state.host.repo,
    rationale: selected?.rationale ?? null,
    revision: selected?.revision ?? null,
  };
}
export function selectBudget(
  state: CloseoutState,
  profile: unknown,
  rationale: unknown,
): CloseoutState {
  const limits = budgetLimits(profile);
  return {
    ...state,
    revision: state.revision + 1,
    receipt: undefined,
    budget: {
      profile: limits.profile,
      rationale: text(rationale, "budget rationale"),
      revision: state.revision + 1,
    },
  };
}
export function inventoryDigest(state: CloseoutState): string {
  return digest({
    id: state.id,
    host: state.host,
    boundary: state.boundary,
    obligations: state.obligations,
  });
}
export function addObligation(state: CloseoutState, input: Omit<Obligation, "id">): CloseoutState {
  if (state.obligations.length >= 30)
    throw new Error("Closeout is bounded to 30 obligations; split owner scope explicitly");
  const item = {
    ...input,
    title: text(input.title, "title", 240),
    acceptance: text(input.acceptance, "acceptance"),
    repo: text(input.repo, "repo"),
  };
  if (!["work", "retained"].includes(item.kind)) throw new Error("Invalid obligation kind");
  if (state.obligations.some((o) => o.title === item.title && o.repo === item.repo))
    throw new Error("Duplicate obligation");
  const obligations = [...state.obligations, { ...item, id: `O${state.obligations.length + 1}` }];
  if (JSON.stringify(obligations).length > 12_000)
    throw new Error("Inventory review budget exceeded; shorten the new item before adding it");
  return {
    ...state,
    revision: state.revision + 1,
    frozenDigest: undefined,
    receipt: undefined,
    obligations,
  };
}
export function bindObligation(state: CloseoutState, binding: Binding): CloseoutState {
  if (state.frozenDigest !== inventoryDigest(state))
    throw new Error("Operator must freeze the inventory first");
  const item = state.obligations.find((o) => o.id === binding.id);
  if (!item) throw new Error("Unknown obligation ID");
  if (!["resolved", "deferred", "retained"].includes(binding.disposition))
    throw new Error("Invalid disposition");
  if ((item.kind === "retained") !== (binding.disposition === "retained"))
    throw new Error("Cannot relabel work as retained state");
  if (item.kind === "work" && !positive(binding.taskId))
    throw new Error("Work requires an exact AK task ID");
  if (binding.disposition === "resolved" && !positive(binding.evidenceId))
    throw new Error("Resolved work requires an exact evidence ID");
  const next = { ...binding, rationale: text(binding.rationale, "rationale") };
  const bindings = [...state.bindings.filter((b) => b.id !== binding.id), next];
  if (JSON.stringify(bindings).length > 8_000)
    throw new Error("Binding review budget exceeded; shorten the proposed rationale");
  return { ...state, revision: state.revision + 1, receipt: undefined, bindings };
}
export function evaluate(
  state: CloseoutState,
  observations: Observation[],
  activity: string,
  barriers: string[],
) {
  const blockers = [...barriers];
  if (state.frozenDigest !== inventoryDigest(state))
    blockers.push("Inventory is not operator-frozen");
  if (
    observations.length !== state.obligations.length ||
    new Set(observations.map((o) => o.id)).size !== observations.length
  )
    blockers.push("Incomplete or duplicate owner readback");
  for (const item of state.obligations) {
    const observation = observations.find((o) => o.id === item.id);
    const binding = state.bindings.find((b) => b.id === item.id);
    if (observation?.validUntil !== undefined && observation.validUntil <= Date.now())
      blockers.push(`${item.id}: deferral expired during evaluation`);
    if (!observation?.valid || !binding || binding.disposition !== observation.disposition)
      blockers.push(`${item.id}: ${observation?.reason ?? "missing readback/binding"}`);
  }
  const work: "COMPLETE" | "INCOMPLETE" = state.obligations.some(
    (o) =>
      o.kind === "work" && state.bindings.find((b) => b.id === o.id)?.disposition !== "resolved",
  )
    ? "INCOMPLETE"
    : "COMPLETE";
  return {
    blockers,
    work,
    digest: digest({
      inventory: inventoryDigest(state),
      budget: closeoutBudget(state),
      bindings: state.bindings,
      observations,
      activity,
      barriers,
    }),
    observations,
  };
}
export type Evaluation = ReturnType<typeof evaluate>;

/** Reject corrupt, foreign, or silently weakened persisted snapshots. Not an OS sandbox. */
export function restoreState(rows: unknown[], host: HostIdentity): CloseoutState | undefined {
  let previous: CloseoutState | undefined;
  for (const value of rows) {
    const s = value as CloseoutState;
    if (!s || s.schema !== 1 || !s.host || typeof s.host.sessionId !== "string")
      throw new Error("Corrupt closeout journal");
    if (s.host.sessionId !== host.sessionId) continue; // inherited fork state is never this session's receipt
    if (
      digest(s.host) !== digest(host) ||
      !positive(s.revision) ||
      !Array.isArray(s.obligations) ||
      !Array.isArray(s.bindings) ||
      s.obligations.length > 30
    )
      throw new Error("Closeout identity/schema drift");
    closeoutBudget(s); // Legacy absence means default; malformed selections fail closed.
    if (
      previous &&
      (s.id !== previous.id ||
        s.revision !== previous.revision + 1 ||
        digest(s.obligations.slice(0, previous.obligations.length)) !==
          digest(previous.obligations))
    )
      throw new Error("Closeout journal lost or rewrote obligations");
    for (const [index, item] of s.obligations.entries()) {
      if (item.id !== `O${index + 1}` || !["work", "retained"].includes(item.kind))
        throw new Error("Corrupt obligation ID/kind");
      text(item.title, "title", 240);
      text(item.acceptance, "acceptance");
      text(item.repo, "repo");
    }
    if (
      new Set(s.bindings.map((b) => b.id)).size !== s.bindings.length ||
      s.bindings.some((b) => !s.obligations.some((o) => o.id === b.id))
    )
      throw new Error("Corrupt binding inventory");
    if (s.frozenDigest && s.frozenDigest !== inventoryDigest(s))
      throw new Error("Frozen inventory digest mismatch");
    previous = s;
  }
  return previous;
}
