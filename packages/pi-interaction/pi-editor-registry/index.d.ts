// summary: Declares the public trigger editor and editor registry TypeScript contracts.
// read_when:
//   - Typing consumers of the pi-editor-registry package.

export declare class TriggerEditor {
  constructor(
    tui: unknown,
    theme: unknown,
    keybindings: unknown,
    pi: unknown,
    ui: unknown,
    sessionCtx?: { cwd?: string; sessionKey?: string },
  );
  focused: boolean;
  getText(): string;
  getExpandedText?(): string;
  setText(text: string): void;
  getMutationGeneration(): number;
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
