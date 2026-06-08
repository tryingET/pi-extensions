import path from "node:path";
import type {
  ExecuteAutoresearchFinalizeDecisionInput,
  ExecuteAutoresearchFinalizeDecisionResult,
  ExecuteAutoresearchSetupDecisionInput,
  ExecuteAutoresearchSetupDecisionResult,
} from "./runtime-model.ts";
import {
  buildAutoresearchRuntimeStatus,
  enrichFinalizeDecisionPacket,
  enrichSetupDecisionPacket,
} from "./runtime-status.ts";

export async function requestAutoresearchSetupDecision(
  input: ExecuteAutoresearchSetupDecisionInput,
): Promise<ExecuteAutoresearchSetupDecisionResult> {
  const cwd = path.resolve(input.cwd);
  const outcome = await input.runtime.runSetup(enrichSetupDecisionPacket(cwd, input.packet), {
    cwd,
    currentCompany: input.currentCompany,
    model: input.model,
    signal: input.signal,
  });

  return {
    cwd,
    outcome,
    status: buildAutoresearchRuntimeStatus(cwd),
  };
}

export async function requestAutoresearchFinalizeDecision(
  input: ExecuteAutoresearchFinalizeDecisionInput,
): Promise<ExecuteAutoresearchFinalizeDecisionResult> {
  const cwd = path.resolve(input.cwd);
  const outcome = await input.runtime.runFinalize(enrichFinalizeDecisionPacket(cwd, input.packet), {
    cwd,
    currentCompany: input.currentCompany,
    model: input.model,
    signal: input.signal,
  });

  return {
    cwd,
    outcome,
    status: buildAutoresearchRuntimeStatus(cwd),
  };
}
