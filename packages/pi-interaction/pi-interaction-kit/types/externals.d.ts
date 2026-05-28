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
