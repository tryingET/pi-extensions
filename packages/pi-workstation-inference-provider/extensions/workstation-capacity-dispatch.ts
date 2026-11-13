import { boundCapacityPayload } from "./workstation-capacity.ts";
import {
  assertCapacity,
  normalizeBaseUrl,
  resolveContractForModel,
} from "./workstation-inference-contract.ts";

type Binding = Awaited<ReturnType<typeof resolveContractForModel>>;
export function capacityFingerprint(binding: Binding): string {
  return JSON.stringify([binding.source, binding.sourceRole, binding.contract, binding.model]);
}

/** Recheck serialized bytes after Pi/OpenAI hooks and on every retry. No network here. */
export function capacityFetch(
  binding: Binding,
  transport: typeof fetch = globalThis.fetch,
): typeof fetch {
  const expected = capacityFingerprint(binding);
  const id = binding.model.pi_model_id ?? (binding.model.id as string);
  const endpoint = `${normalizeBaseUrl(binding.contract.base_url)}/chat/completions`;
  return async (input, init) => {
    if (
      input instanceof Request ||
      String(input) !== endpoint ||
      init?.method?.toUpperCase() !== "POST" ||
      typeof init.body !== "string"
    )
      throw new Error("capacity dispatch requires the exact serialized contract endpoint");
    const payload: unknown = JSON.parse(init.body);
    const headers = new Headers(init.headers);
    headers.delete("content-length");
    // Do not share a stale generation or an earlier refresh's pending promise.
    const current = await resolveContractForModel(id, { checkHealth: false });
    if (capacityFingerprint(current) !== expected)
      throw new Error("capacity binding changed before dispatch; select the current registration");
    const admission = assertCapacity(current.model);
    const body = JSON.stringify(boundCapacityPayload(payload, id, admission.maxTokens));
    // No await/caller callback between the final proof check and transport invocation.
    assertCapacity(current.model);
    return transport(input, { ...init, headers, body, redirect: "error" });
  };
}
