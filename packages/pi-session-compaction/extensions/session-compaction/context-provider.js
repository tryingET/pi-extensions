/**
summary: "Narrow adapter from session compaction to pi-context-packer's stable provider API."
read_when:
  - "Changing verified worktree integration or context-provider dependency boundaries."
*/

const PROVIDER_API = "@tryinget/pi-context-packer/api:v1";
const PROVIDER_API_SYMBOL = Symbol.for("tryinget.pi-context-packer.provider-api.v1");

function isAbort(error, signal) {
  return (
    signal?.aborted === true ||
    error?.name === "AbortError" ||
    /\b(?:aborted|cancelled)\b/iu.test(error instanceof Error ? error.message : String(error))
  );
}

async function loadProviderApi(deps) {
  if (deps.contextProviderApi) return deps.contextProviderApi;
  const globalApi = globalThis[PROVIDER_API_SYMBOL];
  if (globalApi?.apiVersion === 1) return globalApi;
  return import("@tryinget/pi-context-packer/api");
}

export async function collectCurrentWorktreeState(input = {}, deps = {}) {
  try {
    const api = await loadProviderApi(deps);
    const createProvider = deps.createGitWorktreeProvider ?? api.createGitWorktreeProvider;
    const runProvider = deps.runReadOnlyContextProvider ?? api.runReadOnlyContextProvider;
    if (typeof createProvider !== "function" || typeof runProvider !== "function") {
      throw new Error("pi-context-packer stable provider API is incomplete");
    }
    const provider = deps.gitWorktreeProvider ?? createProvider(deps.gitWorktreeProviderDeps);
    const result = await runProvider(
      provider,
      {
        cwd: input.cwd,
        maxPaths: input.maxPaths ?? 24,
      },
      {
        signal: input.signal,
        limits: {
          maxItems: 1,
          maxItemChars: 4_000,
          maxTotalChars: 4_000,
          maxOmissions: 16,
        },
        stateLimits: {
          maxStateDepth: 4,
          maxStateArrayItems: 32,
          maxStateObjectEntries: 64,
          maxStateStringChars: 1_000,
        },
      },
    );
    return {
      ...result,
      verified: result?.ok === true && result?.state?.verified === true,
      providerApi: PROVIDER_API,
    };
  } catch (error) {
    if (isAbort(error, input.signal)) throw error;
    return {
      ok: false,
      verified: false,
      provider: "git-worktree",
      providerVersion: "v1",
      providerApi: PROVIDER_API,
      omissions: [
        {
          provider: "git-worktree",
          reason: "unavailable",
          detail: "verified worktree provider unavailable; raw error detail withheld",
          retryable: true,
        },
      ],
      nonAuthorization:
        "No worktree mutation was attempted; current state must be verified from the git owner surface.",
    };
  }
}
