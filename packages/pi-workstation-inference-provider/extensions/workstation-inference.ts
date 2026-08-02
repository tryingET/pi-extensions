/**
summary: "Loads workstation inference contracts, registers provider models, streams completions, and exposes status and refresh commands."
read_when:
  - "Changing workstation contract validation, health checks, provider registration, model streaming, or lane-op commands."
*/
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  inheritedAuthorityTransportFromEnvironment,
  WORKBENCH_AUTHORITY_FD_ENV,
  WorkbenchInheritedAuthorityChannel,
} from "./workstation-authority-channel.ts";
import { sendAudioTurn, sendWorkbenchAudioTurn } from "./workstation-inference-audio-turn.ts";
import {
  CANARY_CONTRACT_ENV,
  CONTRACT_ENV,
  CONTRACT_JSON_ENV,
  type ContractStatus,
  contractApiKey,
  DEFAULT_PROVIDER_ID,
  DEFAULT_PROVIDER_NAME,
  DEFAULT_WORKSTATION_ROOT,
  defaultContractPath,
  defaultHealthUrl,
  defaultInklingContractPath,
  INKLING_CONTRACT_ENV,
  LANE_OP_SCRIPT,
  normalizeBaseUrl,
  notifyOrLog,
  providerModel,
  resolveContractStatus,
  WORKSTATION_API_ID,
  WORKSTATION_ROOT_ENV,
  type WorkstationInferenceContract,
  workstationRoot,
} from "./workstation-inference-contract.ts";
import {
  quarantineCurrentAudio,
  streamWorkstationInference,
} from "./workstation-inference-stream.ts";

export { sendWorkbenchAudioTurn } from "./workstation-inference-audio-turn.ts";
export {
  clearWorkstationHealthCache,
  providerModel,
  resolveContractStatus,
} from "./workstation-inference-contract.ts";
export { streamWorkstationInference } from "./workstation-inference-stream.ts";

async function runLaneOp(
  pi: ExtensionAPI,
  args: string[],
): Promise<{ ok: true; stdout: string } | { ok: false; detail: string }> {
  const result = await pi.exec("python3", [LANE_OP_SCRIPT, ...args], {
    cwd: workstationRoot(),
    timeout: 60_000,
  });
  if (result.code !== 0) {
    return {
      ok: false,
      detail: [
        `lane-op exited ${result.code}`,
        result.stderr.trim() ? `stderr: ${result.stderr.trim()}` : undefined,
        result.stdout.trim() ? `stdout: ${result.stdout.trim()}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    };
  }
  return { ok: true, stdout: result.stdout.trim() };
}

function statusText(status: ContractStatus): string {
  const contract = status.contract;
  const lines = [
    `status: ${status.status}`,
    `summary: ${status.summary}`,
    status.source ? `source: ${status.source}` : undefined,
    status.detail ? `detail: ${status.detail}` : undefined,
    contract ? `provider: ${contract.provider_id ?? DEFAULT_PROVIDER_ID}` : undefined,
    contract ? `base_url: ${normalizeBaseUrl(contract.base_url)}` : undefined,
    contract ? `health_url: ${contract.health_url ?? defaultHealthUrl(contract)}` : undefined,
    contract ? `authority: ${contract.authority ?? "unspecified"}` : undefined,
    contract ? `family/surface: ${contract.family ?? "?"}/${contract.surface ?? "?"}` : undefined,
    contract
      ? `models: ${contract.models.map((model) => model.pi_model_id ?? model.id).join(", ")}`
      : undefined,
    contract?.recovery_hint ? `recovery_hint: ${contract.recovery_hint}` : undefined,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function registerContractProvider(
  pi: ExtensionAPI,
  contract: WorkstationInferenceContract,
): string {
  const providerId = contract.provider_id ?? DEFAULT_PROVIDER_ID;
  pi.registerProvider(providerId, {
    name: contract.provider_name ?? DEFAULT_PROVIDER_NAME,
    baseUrl: normalizeBaseUrl(contract.base_url),
    apiKey: contractApiKey(contract),
    api: WORKSTATION_API_ID,
    models: contract.models.map(providerModel),
    streamSimple: (model, context, options) =>
      streamWorkstationInference(model, context, options, pi),
  });
  return providerId;
}

export default async function (pi: ExtensionAPI) {
  try {
    await quarantineCurrentAudio(pi, "extension-reload-before-provider-dispatch");
  } catch {
    // A failed disposition is indeterminate and never authorizes retry or release.
  }
  const initial = await resolveContractStatus({ checkHealth: false });

  if (typeof pi.on === "function") {
    const dispose = (reason: string) => async () => {
      try {
        await quarantineCurrentAudio(pi, reason);
      } catch {
        // Lifecycle cleanup failure cannot grant provider or scheduler authority.
      }
    };
    pi.on("agent_end", dispose("agent-ended-before-provider-dispatch"));
    pi.on("model_select", dispose("model-changed-before-provider-dispatch"));
    pi.on("session_before_switch", dispose("session-switched-before-provider-dispatch"));
    pi.on("session_shutdown", dispose("session-shutdown-before-provider-dispatch"));
  }

  pi.registerCommand("workstation-inference", {
    description: "Show read-only workstation inference provider status",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const firstSpace = trimmed.search(/\s/);
      const action =
        (firstSpace < 0 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase() || "status";
      const actionArgs = firstSpace < 0 ? "" : trimmed.slice(firstSpace + 1).trim();
      if (action === "help") {
        notifyOrLog(
          ctx,
          [
            "/workstation-inference status  Show contract and health status",
            "/workstation-inference refresh  Ask lane-op to refresh canonical and canary provider contracts",
            "/workstation-inference lane-status  Show lane-op baseline-text status",
            "/workstation-inference contract  Show the expected contract path/env",
            "/workstation-inference audio-send --handoff <claim.json> --scheduler-db <scheduler.sqlite3> <audio> -- <prompt>  Consume one external scheduler claim",
            "/workstation-inference workbench-audio-send <audio> -- <prompt>  Consume one broker-owned inherited authority turn",
          ].join("\n"),
        );
        return;
      }
      if (action === "contract") {
        notifyOrLog(
          ctx,
          [
            `contract env: ${CONTRACT_ENV}`,
            `canary contract env: ${CANARY_CONTRACT_ENV}`,
            `Inkling contract env: ${INKLING_CONTRACT_ENV}`,
            `inline contract env: ${CONTRACT_JSON_ENV}`,
            `workstation root env: ${WORKSTATION_ROOT_ENV}`,
            `Workbench inherited authority fd env: ${WORKBENCH_AUTHORITY_FD_ENV}`,
            `default workstation root: ${DEFAULT_WORKSTATION_ROOT}`,
            `default canonical path: ${defaultContractPath("canonical")}`,
            `default canary path: ${defaultContractPath("canary")}`,
            `default Inkling path: ${defaultInklingContractPath()}`,
          ].join("\n"),
        );
        return;
      }
      if (action === "audio-send") {
        try {
          await sendAudioTurn(pi, actionArgs, ctx);
        } catch (error) {
          notifyOrLog(ctx, error instanceof Error ? error.message : String(error), "error");
        }
        return;
      }
      if (action === "workbench-audio-send") {
        try {
          const authority = new WorkbenchInheritedAuthorityChannel(
            inheritedAuthorityTransportFromEnvironment(),
          );
          await sendWorkbenchAudioTurn(pi, actionArgs, ctx, authority);
        } catch (error) {
          notifyOrLog(ctx, error instanceof Error ? error.message : String(error), "error");
        }
        return;
      }
      if (action === "refresh") {
        const canonicalRefresh = await runLaneOp(pi, [
          "provider-contract",
          "baseline-text",
          "--surface",
          "canonical",
          "--write",
        ]);
        if (!canonicalRefresh.ok) {
          notifyOrLog(
            ctx,
            `workstation inference canonical refresh failed\n${canonicalRefresh.detail}`,
            "error",
          );
          return;
        }
        const canaryRefresh = await runLaneOp(pi, [
          "provider-contract",
          "baseline-text",
          "--surface",
          "canary",
          "--write",
        ]);
        if (!canaryRefresh.ok) {
          notifyOrLog(
            ctx,
            `workstation inference canary refresh failed\n${canaryRefresh.detail}`,
            "error",
          );
          return;
        }
        let inklingWarning: string | undefined;
        const inklingRefresh = await runLaneOp(pi, [
          "provider-contract",
          "inkling",
          "--surface",
          "canary",
          "--write",
        ]);
        if (!inklingRefresh.ok) {
          inklingWarning = `optional Inkling refresh unavailable: ${inklingRefresh.detail}`;
        }
        const status = await resolveContractStatus({ checkHealth: true });
        if (status.status === "ok" && status.contract)
          registerContractProvider(pi, status.contract);
        notifyOrLog(
          ctx,
          ["refresh: ok", inklingWarning, statusText(status)]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
          inklingWarning ? "warning" : "info",
        );
        return;
      }
      if (action === "lane-status") {
        const status = await runLaneOp(pi, ["status", "baseline-text", "--surface", "canonical"]);
        notifyOrLog(
          ctx,
          status.ok ? status.stdout : `lane-status failed\n${status.detail}`,
          status.ok ? "info" : "error",
        );
        return;
      }
      if (action !== "status") {
        notifyOrLog(ctx, `unknown action: ${action}; try /workstation-inference help`, "warning");
        return;
      }
      const status = await resolveContractStatus({ checkHealth: true });
      if (status.status === "ok" && status.contract) registerContractProvider(pi, status.contract);
      notifyOrLog(ctx, statusText(status));
    },
  });

  if (initial.status === "ok" && initial.contract) registerContractProvider(pi, initial.contract);
}
