// ---
// summary: declares the public model-selection types and exported helper signatures.
// read_when:
//   - integrating model-selection utilities from typed TypeScript consumers.
// ---
export interface PiModelLike {
  id?: string;
  provider?: string;
  headers?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PiModelRegistryLike {
  find?(provider: string, modelId: string): PiModelLike | undefined;
  getAll?(): PiModelLike[];
  getAvailable?(): PiModelLike[];
  isUsingOAuth?(model: PiModelLike): boolean;
  getApiKey?(model: PiModelLike): Promise<string | undefined> | string | undefined;
  getApiKeyAndHeaders?(model: PiModelLike):
    | Promise<{
        ok?: boolean;
        apiKey?: string;
        headers?: Record<string, unknown>;
        env?: Record<string, string>;
        error?: string;
      }>
    | {
        ok?: boolean;
        apiKey?: string;
        headers?: Record<string, unknown>;
        env?: Record<string, string>;
        error?: string;
      };
}

export interface PiModelSelectionContext {
  model?: PiModelLike;
  modelRegistry?: PiModelRegistryLike;
}

export interface SelectedModelCandidate {
  model: PiModelLike;
  alreadyActive: boolean;
}

export interface ResolvedModelAuth {
  ok: boolean;
  apiKey?: string;
  headers?: Record<string, unknown>;
  env?: Record<string, string>;
  error?: string;
}

export const PREFERRED_PROVIDERS: string[];

export function parseProviderModel(value: unknown): { provider: string; modelId: string };
export function parseModelSpecList(value: unknown): string[];
export function resolveModelAuth(
  ctx: PiModelSelectionContext,
  model: PiModelLike,
): Promise<ResolvedModelAuth>;
export function resolveModelReference(ctx: PiModelSelectionContext, reference: string): PiModelLike;
export function selectModelCandidate(
  modelSpecs: string[] | string,
  currentModel: PiModelLike | undefined,
  ctx: PiModelSelectionContext,
): Promise<SelectedModelCandidate | undefined>;

export const modelSelectionInternals: {
  getModelCandidates(modelSpec: string, registry?: PiModelRegistryLike): PiModelLike[];
  modelDisplayRef(model: PiModelLike): string;
  modelSpecMatches(modelSpec: string, model: PiModelLike): boolean;
  orderMatchesByProviderPreference(models: PiModelLike[]): PiModelLike[];
};
