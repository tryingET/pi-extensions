// summary: operator-reviewed session closeout gate; models cannot choose a safe verdict.
// read_when: changing /session-closeout, session_closeout or approval separation.

import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  addObligation,
  bindObligation,
  CLOSEOUT_ENTRY,
  CLOSEOUT_TOOL,
  type CloseoutState,
  digest,
  evaluate,
  inventoryDigest,
  type Observation,
  openState,
} from "../src/sessionCloseout.ts";
import {
  activityDigest,
  hostIdentity,
  journalState,
  pendingCalls,
} from "../src/sessionCloseoutHost.ts";
import { boundCloseoutProcedurePrompt } from "../src/sessionCloseoutPrompt.ts";
import { gitSnapshot, observeObligation, registeredRepo } from "../src/sessionCloseoutReadback.ts";

const parameters = Type.Object(
  {
    action: StringEnum(["open", "status", "add", "freeze", "bind", "check", "seal"] as const),
    title: Type.Optional(Type.String({ maxLength: 240 })),
    acceptance: Type.Optional(Type.String({ maxLength: 2000 })),
    repo: Type.Optional(Type.String({ maxLength: 4096 })),
    kind: Type.Optional(StringEnum(["work", "retained"] as const)),
    id: Type.Optional(Type.String({ pattern: "^O[1-9][0-9]*$" })),
    disposition: Type.Optional(StringEnum(["resolved", "deferred", "retained"] as const)),
    taskId: Type.Optional(Type.Integer({ minimum: 1 })),
    evidenceId: Type.Optional(Type.Integer({ minimum: 1 })),
    rationale: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { additionalProperties: false },
);

export default function sessionCloseout(pi: ExtensionAPI) {
  let busy = false;
  let approving = false;
  const running = new Set<string>();
  let epoch = 0;
  function save(state: CloseoutState) {
    pi.appendEntry(CLOSEOUT_ENTRY, state);
  }
  function display(state: CloseoutState) {
    return {
      closeoutId: state.id,
      sessionId: state.host.sessionId,
      sessionFile: state.host.sessionFile,
      repo: state.host.repo,
      boundary: state.boundary,
      revision: state.revision,
      inventoryDigest: inventoryDigest(state),
      frozen: state.frozenDigest === inventoryDigest(state),
      obligations: state.obligations,
      bindings: state.bindings,
      historicalReceipt: state.receipt ?? null,
      notice:
        "Historical receipt is not a current verdict. check/seal re-read owner state. Scope is declared, not exhaustive.",
    };
  }
  function result(value: unknown) {
    const output = JSON.stringify(value, null, 2);
    if (output.length > 40_000)
      throw new Error("Closeout result exceeds display budget; no positive receipt issued");
    return { content: [{ type: "text" as const, text: output }], details: value };
  }
  async function approval(ctx: ExtensionContext, title: string, body: string) {
    // RPC can be controlled by the executor: v1 accepts only the real operator TUI.
    if (ctx.mode !== "tui" || !ctx.hasUI)
      throw new Error("Operator TUI review required; no headless/RPC auto-approval");
    if (body.length > 96_000)
      throw new Error("Review exceeds 96KB; cannot truncate approval-critical facts");
    const reviewed = await ctx.ui.editor(
      `${title} — inspect/scroll; submit unchanged to continue, Escape to decline`,
      body,
    );
    if (reviewed !== body || ctx.signal?.aborted) return false;
    const token = `approve ${digest(body).slice(0, 12)}`;
    return (await ctx.ui.input(`Type exactly: ${token}`, "No default approval")) === token;
  }
  async function readback(ctx: ExtensionContext, state: CloseoutState, callId?: string) {
    const activity = activityDigest(ctx.sessionManager.getBranch());
    const startEpoch = epoch;
    const observations: Observation[] = [];
    const barriers = pendingCalls(ctx.sessionManager.getBranch(), state.boundary, callId);
    if (ctx.hasPendingMessages()) barriers.push("Queued session messages remain");
    if ([...running].some((id) => id !== callId))
      barriers.push("Other tool execution remains active");
    const snapshots = new Map<string, Awaited<ReturnType<typeof gitSnapshot>>>();
    for (const repo of new Set([state.host.repo, ...state.obligations.map((o) => o.repo)])) {
      snapshots.set(repo, await gitSnapshot(repo));
    }
    for (const item of state.obligations) {
      const git = snapshots.get(item.repo);
      if (!git) throw new Error("Missing repository capture");
      observations.push(
        await observeObligation(
          item,
          state.bindings.find((b) => b.id === item.id),
          git,
        ),
      );
    }
    for (const [repo, snapshot] of snapshots) {
      if ((await gitSnapshot(repo)).digest !== snapshot.digest)
        barriers.push(`Git changed while reading owner facts: ${repo}`);
    }
    if (ctx.signal?.aborted) barriers.push("Closeout cancelled");
    if (activity !== activityDigest(ctx.sessionManager.getBranch()) || epoch !== startEpoch)
      barriers.push("Session activity changed during readback");
    return {
      ...evaluate(state, observations, digest({ activity, snapshots: [...snapshots] }), barriers),
      gitSnapshots: [...snapshots.values()],
      acceptanceBindings: state.obligations.map((o) => ({
        obligation_id: o.id,
        repo: o.repo,
        acceptance_sha256: digest(o.acceptance),
      })),
    };
  }

  async function action(
    params: {
      action: string;
      title?: string;
      acceptance?: string;
      repo?: string;
      kind?: "work" | "retained";
      id?: string;
      disposition?: "resolved" | "deferred" | "retained";
      taskId?: number;
      evidenceId?: number;
      rationale?: string;
    },
    ctx: ExtensionContext,
    callId?: string,
  ) {
    if (busy) throw new Error("Closeout operation already running; serialize calls");
    busy = true;
    try {
      const host = await hostIdentity(ctx);
      let state = journalState(ctx, host);
      if (params.action === "open") {
        if (!state) {
          state = openState(host, ctx.sessionManager.getLeafId());
          save(state);
        }
        return result(display(state));
      }
      if (!state) throw new Error("Open this exact session's closeout first");
      if (params.action === "status") return result(display(state));
      const original = state;
      const mutationEpoch = epoch;
      const mutationActivity = activityDigest(ctx.sessionManager.getBranch());
      const guardMutation = async () => {
        // Await first, then do all synchronous checks immediately before journal append.
        const freshHost = await hostIdentity(ctx);
        if (
          ctx.signal?.aborted ||
          digest(freshHost) !== digest(host) ||
          epoch !== mutationEpoch ||
          activityDigest(ctx.sessionManager.getBranch()) !== mutationActivity ||
          digest(journalState(ctx, host)) !== digest(original)
        )
          throw new Error("Session/journal changed during closeout operation");
      };
      if (params.action === "add") {
        state = addObligation(state, {
          title: params.title ?? "",
          acceptance: params.acceptance ?? "",
          repo: await registeredRepo(params.repo ?? host.repo),
          kind: params.kind ?? "work",
        });
        await guardMutation();
        save(state);
        return result(display(state));
      }
      if (params.action === "bind") {
        state = bindObligation(state, {
          id: params.id ?? "",
          disposition: params.disposition ?? "resolved",
          taskId: params.taskId,
          evidenceId: params.evidenceId,
          rationale: params.rationale ?? "",
        });
        save(state);
        return result(display(state));
      }
      if (params.action === "freeze") {
        approving = true;
        const accepted = await approval(
          ctx,
          "Freeze session closeout inventory?",
          `${JSON.stringify(display(state), null, 2)}\n\nIndependently review scope and acceptance criteria. Include all session obligations; retained is ONLY unrelated operator state. Empty inventory means you confirm nothing needs closing. Later additions invalidate this approval; existing obligations cannot be removed or weakened.`,
        );
        if (!accepted) throw new Error("Inventory not approved; nothing frozen");
        await guardMutation();
        state = {
          ...state,
          revision: state.revision + 1,
          frozenDigest: inventoryDigest(state),
          receipt: undefined,
        };
        save(state);
        return result(display(state));
      }
      if (!["check", "seal"].includes(params.action))
        throw new Error("Unsupported closeout action");
      const checked = await readback(ctx, state, callId);
      if (params.action === "check")
        return result({
          ...checked,
          session: "BLOCKED",
          note: checked.blockers.length
            ? "Resolve blockers; no receipt"
            : "Machine prerequisites passed. Independent operator review still required.",
          historicalReceiptMatches: state.receipt?.digest === checked.digest,
        });
      if (checked.blockers.length) return result({ ...checked, session: "BLOCKED" });
      approving = true;
      const startEpoch = epoch;
      const accepted = await approval(
        ctx,
        "Independently certify safe-to-close declared scope?",
        `${JSON.stringify({ ...display(state), verification: checked }, null, 2)}\n\nAK rows are recorded claims, not semantic proof. Independently check each acceptance criterion and evidence (including actual external outcomes). Accept each deferral's blocker and responsibility/next action explicitly; a named owner is not presumed to have accepted it. Confirm that no active/indeterminate job, partial mutation, session-only artifact, claim or lease depends on this session, or that its verified durable handoff is included above. This is operator acceptance, NOT automatic ASC custody discovery. Cancel if unsure. This receipt does not prevent quitting or confer merge/push/task-completion authority.`,
      );
      if (!accepted)
        throw new Error("Independent operator review declined; session remains BLOCKED");
      const freshHost = await hostIdentity(ctx);
      if (digest(freshHost) !== digest(host) || epoch !== startEpoch)
        throw new Error("Host activity changed during approval");
      const fresh = await readback(ctx, state, callId);
      if (fresh.blockers.length || fresh.digest !== checked.digest)
        throw new Error("Owner/Git/session facts changed during review; obtain fresh approval");
      await guardMutation();
      if (fresh.observations.some((o) => o.validUntil !== undefined && o.validUntil <= Date.now()))
        throw new Error("Deferral expired before receipt issuance");
      const receipt: NonNullable<CloseoutState["receipt"]> = {
        id: randomUUID(),
        at: new Date().toISOString(),
        digest: checked.digest,
        work: checked.work,
        session: "SAFE_TO_CLOSE",
        reviewer: "operator-confirmation",
        coverage: "operator-reviewed declared obligations; not exhaustive process discovery",
      };
      // Receipt binds the reviewed revision, retained in the journal; status never treats it as fresh automatically.
      save({ ...state, revision: state.revision + 1, receipt });
      return result({
        ...receipt,
        closeoutId: state.id,
        obligations: state.obligations.map((o) => ({
          id: o.id,
          binding: state.bindings.find((b) => b.id === o.id),
        })),
        note: "Closeout receipt recorded in this exact session journal. AK remains obligation authority. Any subsequent work requires re-evaluation.",
      });
    } finally {
      busy = false;
      approving = false;
    }
  }

  pi.registerTool({
    name: CLOSEOUT_TOOL,
    label: "Session closeout gate",
    description:
      "Open exact host-bound closeout, append obligations, request operator freeze, bind AK evidence/deferrals, check, then request independent operator seal. No supplied verdict accepted. Seal only in TUI, serially and alone. Mutates only session-local gate journal; reads AK/Git without lifecycle writes. Does not prove exhaustive discovery or automatically verify ASC custody.",
    parameters,
    async execute(id, params, _signal, _update, ctx) {
      return action(params, ctx, id);
    },
  });
  pi.registerCommand("session-closeout", {
    description:
      "Start the runtime closeout workflow, or inspect status/check/seal (operator-reviewed)",
    handler: async (args, ctx) => {
      try {
        const operation = args.trim() || "open";
        if (!["open", "status", "check", "seal"].includes(operation))
          throw new Error("Usage: /session-closeout [status|check|seal]");
        if (!ctx.isIdle() || ctx.hasPendingMessages())
          throw new Error("Wait for the session to settle before using the command");
        const outcome = await action({ action: operation }, ctx);
        pi.sendMessage({
          customType: "session-closeout-report",
          content: outcome.content,
          display: true,
        });
        if (operation === "open") {
          const directory = join(homedir(), ".pi", "agent", "prompts");
          const path = join(directory, "close-session.md");
          if ((await stat(path)).size > 32_000) throw new Error("Closeout prompt exceeds 32KB");
          const content = await readFile(path, "utf8");
          const manifest = JSON.parse(
            await readFile(join(directory, ".prompt-vault-export-state.json"), "utf8"),
          );
          const entries = Array.isArray(manifest.templates)
            ? manifest.templates.filter((e: { name?: string }) => e.name === "close-session")
            : [];
          if (
            manifest.schema !== "prompt-vault/pi-export-receipt/v2" ||
            entries.length !== 1 ||
            entries[0].sha256 !== createHash("sha256").update(content).digest("hex")
          )
            throw new Error(
              "Gate opened, but close-session lacks a matching Vault export receipt; export from Vault first",
            );
          const host = outcome.details as {
            closeoutId: string;
            sessionId: string;
            sessionFile: string;
            repo: string;
            boundary: string;
          };
          pi.sendUserMessage(boundCloseoutProcedurePrompt(content, host));
        }
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : "Closeout failed", "error");
      }
    },
  });
  pi.on("tool_execution_start", (e) => {
    running.add(e.toolCallId);
    if (e.toolName !== CLOSEOUT_TOOL) epoch++;
  });
  pi.on("tool_execution_end", (e) => {
    running.delete(e.toolCallId);
    if (e.toolName !== CLOSEOUT_TOOL) epoch++;
  });
  pi.on("tool_call", (e) => {
    if (approving && e.toolName !== CLOSEOUT_TOOL)
      return {
        block: true,
        reason: "Operator closeout review in progress; no concurrent tool effects",
      };
  });
  pi.on("input", () => {
    epoch++;
  });
  pi.on("user_bash", () => {
    epoch++;
  });
  pi.on("session_tree", () => {
    epoch++;
  });
  pi.on("session_start", () => {
    epoch++;
    running.clear();
  });
  pi.on("session_shutdown", () => {
    epoch++;
  });
}
