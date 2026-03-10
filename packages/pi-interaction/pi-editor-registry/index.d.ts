export declare class TriggerEditor {
  constructor(
    tui: unknown,
    theme: unknown,
    keybindings: unknown,
    pi: unknown,
    ui: unknown,
    sessionCtx?: { cwd?: string; sessionKey?: string },
  );
}

export declare function createEditorRegistry(options?: { ownerId?: string }): {
  mount(params: unknown): boolean;
  diagnostics(): {
    ownerId: string;
    mounted: boolean;
    mountCount: number;
    lastMountedAt?: string;
  };
};
