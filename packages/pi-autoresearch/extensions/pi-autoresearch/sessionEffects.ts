// ---
// summary: "Provides the eager revocable fence used to suppress session effects after shutdown."
// read_when:
//   - "Changing session liveness, retained callback guards, or best-effort cancellation."
// ---

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type AutoresearchSessionEffectResult<T> =
  | { committed: true; value: T }
  | { committed: false };

export interface AutoresearchSessionEffects {
  readonly signal: AbortSignal;
  isActive(): boolean;
  revoke(): void;
  commit<T>(effect: () => T): AutoresearchSessionEffectResult<T>;
  commitAsync<T>(effect: () => Promise<T> | T): Promise<AutoresearchSessionEffectResult<T>>;
  guard<Args extends unknown[], Result>(
    effect: (...args: Args) => Result,
  ): (...args: Args) => Result | undefined;
}

export class AutoresearchSessionEndedError extends Error {
  constructor() {
    super("Pi-autoresearch session ended before the requested operation could start.");
    this.name = "AutoresearchSessionEndedError";
  }
}

export function isAutoresearchSessionEndedError(
  error: unknown,
): error is AutoresearchSessionEndedError {
  return error instanceof AutoresearchSessionEndedError;
}

export function assertAutoresearchSessionActive(effects: AutoresearchSessionEffects): void {
  if (!effects.isActive()) throw new AutoresearchSessionEndedError();
}

export function composeAutoresearchSessionSignal(
  effects: AutoresearchSessionEffects,
  hostSignal: AbortSignal | undefined,
): AbortSignal {
  return hostSignal && hostSignal !== effects.signal
    ? AbortSignal.any([hostSignal, effects.signal])
    : effects.signal;
}

export function notifyAutoresearch(
  ctx: ExtensionContext,
  effects: AutoresearchSessionEffects,
  message: string,
  level: "info" | "warning" | "error",
): void {
  effects.commit(() => ctx.ui.notify(message, level));
}

export function openAutoresearchEditor(
  ctx: ExtensionContext,
  effects: AutoresearchSessionEffects,
  title: string,
  text: string,
) {
  return effects.commitAsync(() => ctx.ui.editor(title, text));
}

/**
 * A session owns this fence. Revocation happens before cleanup so an already-retained
 * callback cannot race the cleanup path and commit a stale host/UI effect.
 */
export function createAutoresearchSessionEffects(): AutoresearchSessionEffects {
  const controller = new AbortController();
  let active = true;

  const isActive = () => active;
  const commit = <T>(effect: () => T): AutoresearchSessionEffectResult<T> => {
    if (!active) return { committed: false };
    return { committed: true, value: effect() };
  };

  return {
    signal: controller.signal,
    isActive,
    revoke() {
      if (!active) return;
      active = false;
      controller.abort();
    },
    commit,
    async commitAsync<T>(
      effect: () => Promise<T> | T,
    ): Promise<AutoresearchSessionEffectResult<T>> {
      if (!active) return { committed: false };
      try {
        const value = await effect();
        return active ? { committed: true, value } : { committed: false };
      } catch (error) {
        if (!active) return { committed: false };
        throw error;
      }
    },
    guard<Args extends unknown[], Result>(
      effect: (...args: Args) => Result,
    ): (...args: Args) => Result | undefined {
      return (...args) => (active ? effect(...args) : undefined);
    },
  };
}
