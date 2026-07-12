// summary: Supplies the minimal pi-tui declarations used to type the interaction overlay.
// read_when:
//   - Updating interaction-kit compatibility with pi-tui exports.

declare module "@earendil-works/pi-tui" {
  export const Container: new (...args: unknown[]) => { invalidate: () => void };
  export const Input: new () => {
    focused: boolean;
    handleInput: (data: string) => void;
    getValue: () => string;
    render: (width: number) => string[];
    invalidate: () => void;
  };
  export const getKeybindings: () => {
    matches: (data: string, keyName: string) => boolean;
    getKeys: (keyName: string) => string[];
  };
  export const truncateToWidth: (text: unknown, width: number) => string;
  export const visibleWidth: (text: unknown) => number;
}
