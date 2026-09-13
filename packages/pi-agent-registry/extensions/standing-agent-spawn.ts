// summary: register exact-task visible admission; no transport/session machinery here.
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentRegistry } from "../src/registry.ts";
import { spawnStandingAgentVisible } from "../src/visible-launch.ts";

export function registerStandingAgentSpawnTool({
  pi,
  getRegistry,
}: {
  pi: ExtensionAPI;
  getRegistry: () => Promise<AgentRegistry>;
}): void {
  pi.registerTool({
    name: "standing_agent_spawn",
    label: "Standing Agent Visible Admission (Phase 3)",
    description:
      "Request ONE clean visible Pi TUI session in a Ghostty tab/window (Fleet Phase 3), composed as a read-only standing agent for an exact claimed AK task in this origin repository. Requires a nonblank bounded objective, clean committed agent inputs and trusted explicit ACK/presence/provider bootstrap. Atomically reserves the agent/task pair before transport: unresolved or admitted launches cannot be retried automatically, even after cancellation or crashes. Explicit owner disposition is required. Transport admission does NOT prove session startup, ACK, read-only lifetime behavior, task consumption or completion; no AK evidence is written. Read/bash posture is advisory, not a sandbox.",
    promptSnippet:
      "Request one exact-task read-only visible standing-agent admission, not task completion.",
    promptGuidelines: [
      "standing_agent_spawn requires agent discovery, an exact claimed AK task, a bounded read-only objective and an exact controller session id for intercom report-back.",
      "Never retry standing_agent_spawn automatically for a reserved/admitted or indeterminate agent/task pair; supervise the returned runId.",
    ],
    parameters: Type.Object({
      agent: Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" }),
      task: Type.Integer({
        minimum: 1,
        description: "Exact claimed AK task in the origin repository.",
      }),
      objective: Type.String({
        minLength: 1,
        maxLength: 32_768,
        description:
          "Bounded read-only inspection/report objective, maximum 32 KiB UTF-8. No standby or mutation.",
      }),
      reportBack: Type.Optional(
        StringEnum(["intercom", "manual", "none"] as const, { description: "Default intercom." }),
      ),
      parentPeerTarget: Type.Optional(
        Type.String({ description: "Exact controller session id; required for intercom." }),
      ),
      cwd: Type.Optional(
        Type.String({
          description:
            "Existing directory within the exact task's origin repository; defaults to that root.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const registry = await getRegistry();
      const outcome = await spawnStandingAgentVisible(
        params,
        { registry, pi },
        {
          cwd: ctx.cwd,
          ...(ctx.model ? { model: ctx.model as { provider?: string; id?: string } } : {}),
        },
        signal,
      );
      const text = outcome.ok
        ? `Transport admitted (${outcome.launchMode}), run ${outcome.runId}. Session start, ACK and task completion remain unproven.\nReceipt: ${outcome.receiptPath}`
        : `${outcome.message}${outcome.runId ? `\nSupervision run: ${outcome.runId}` : ""}`;
      return {
        content: [{ type: "text" as const, text }],
        details: {
          ok: outcome.ok,
          phase: outcome.phase,
          ...(outcome.runId ? { runId: outcome.runId } : {}),
          ...(outcome.ok
            ? { admission: outcome.admission }
            : {
                reason: outcome.reason,
                effectDisposition: outcome.effectDisposition,
                spawnAttempted: outcome.spawnAttempted,
              }),
          ...(outcome.receiptPath ? { receiptPath: outcome.receiptPath } : {}),
          ...(outcome.receipt ? { receiptSha256: outcome.receipt.receiptSha256 } : {}),
        },
        ...(!outcome.ok ? { isError: true } : {}),
      };
    },
  });
}
