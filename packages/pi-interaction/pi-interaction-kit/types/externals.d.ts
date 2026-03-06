declare module "@mariozechner/pi-coding-agent" {
  export const editorKey: (name: string) => string;
}

declare module "@mariozechner/pi-tui" {
  export const Container: new (...args: unknown[]) => { invalidate: () => void };
  export const Input: new () => {
    focused: boolean;
    handleInput: (data: string) => void;
    getValue: () => string;
    render: (width: number) => string[];
    invalidate: () => void;
  };
  export const getEditorKeybindings: () => { matches: (data: string, keyName: string) => boolean };
  export const truncateToWidth: (text: unknown, width: number) => string;
  export const visibleWidth: (text: unknown) => number;
}
