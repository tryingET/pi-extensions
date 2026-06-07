import { canCampaignMachineStartBoundedRun } from "../machine/campaign.ts";
import { campaignEvents } from "../machine/events.ts";
import { appendLedgerEvent, createLedgerEventEntry } from "./ledger.ts";
import type { AutoresearchRuntimeStatus } from "./runtime-model.ts";
import { loadReceiptLog, resolveAutoresearchPaths } from "./runtime-receipts.ts";
import { buildAutoresearchRuntimeStatusFromEntries } from "./runtime-status-projection.ts";

function buildAutoresearchRuntimeStatusForProjection(cwd: string): AutoresearchRuntimeStatus {
  const paths = resolveAutoresearchPaths(cwd);
  const { entries, invalidLineCount } = loadReceiptLog(cwd);
  return buildAutoresearchRuntimeStatusFromEntries(cwd, paths, entries, invalidLineCount, {
    persistSnapshot: false,
  });
}

export function ensureMachineReadyForBoundedRun(
  cwd: string,
  options: { allowBootstrapConfig?: boolean; allowRebaselineReconfigure?: boolean } = {},
): void {
  let status = buildAutoresearchRuntimeStatusForProjection(cwd);

  if (status.control.kind === "continue") {
    consumeAutoresearchContinueControl(cwd, status);
    status = buildAutoresearchRuntimeStatusForProjection(cwd);
  }

  if (status.control.kind === "awaiting_operator") {
    throw new Error(
      `Cannot start a bounded autoresearch run while control state awaiting_operator requires one of: ${formatAllowedActions(status.control.allowedActions)}`,
    );
  }

  if (status.control.kind === "rebaseline" && options.allowRebaselineReconfigure === true) {
    return;
  }

  if (
    status.control.kind === "rebaseline" ||
    status.control.kind === "finalize" ||
    status.control.kind === "stop"
  ) {
    throw new Error(
      `Cannot start a bounded autoresearch run while control state ${status.control.kind} is selected`,
    );
  }

  if (!canCampaignMachineStartBoundedRun(status.runtimeProjection.state)) {
    if (
      options.allowBootstrapConfig === true &&
      status.runtimeProjection.state === "segment_unconfigured"
    ) {
      return;
    }
    throw new Error(
      `Cannot start a bounded autoresearch run while the machine is in state ${status.runtimeProjection.state}`,
    );
  }
}

function consumeAutoresearchContinueControl(cwd: string, status: AutoresearchRuntimeStatus): void {
  switch (status.runtimeProjection.state) {
    case "awaiting_decision":
      appendLedgerEvent(
        cwd,
        createLedgerEventEntry(
          campaignEvents.decideNextAction(
            "iterate",
            "operator selected continue through autoresearch_runtime_control",
          ),
        ),
      );
      return;
    case "finalize_candidate":
      appendLedgerEvent(cwd, createLedgerEventEntry(campaignEvents.rejectFinalize()));
      return;
    default:
      return;
  }
}

function formatAllowedActions(actions: readonly string[]): string {
  return actions.length > 0 ? actions.join(", ") : "(none)";
}
