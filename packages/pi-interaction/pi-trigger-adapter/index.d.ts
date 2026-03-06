export type TriggerContext = {
  fullText: string;
  textBeforeCursor: string;
  textAfterCursor: string;
  cursorLine: number;
  cursorColumn: number;
  totalLines: number;
  isLive: boolean;
};

export declare class TriggerBroker {
  register(
    trigger: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  unregister(id: string): boolean;
  get(id: string): Record<string, unknown> | undefined;
  list(): Record<string, unknown>[];
  diagnostics(): Record<string, unknown>[];
  setEnabled(id: string, enabled: boolean): boolean;
  checkAndFire(context: TriggerContext): Promise<boolean>;
  clear(): void;
  setAPI(api: Record<string, unknown>): void;
}

export declare function getBroker(): TriggerBroker;
export declare function resetBroker(): void;
export declare function registerPickerInteraction(
  config: Record<string, unknown>,
  options?: Record<string, unknown>,
): Record<string, unknown>;
export declare function splitQueryAndContext(
  raw: unknown,
  separator?: string,
): { query: string; context: string };
