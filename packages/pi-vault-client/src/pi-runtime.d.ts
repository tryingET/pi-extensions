/* biome-ignore-all lint/suspicious/noExplicitAny: ambient extension shims intentionally permissive */

declare const process: {
  env: Record<string, string | undefined>;
  cwd?: () => string;
};

declare module "node:child_process" {
  export function execFileSync(
    command: string,
    args?: string[],
    options?: Record<string, unknown>,
  ): string;
}

declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    on(event: string, handler: (...args: any[]) => any): void;
    registerCommand(
      name: string,
      command: { description?: string; handler: (...args: any[]) => any },
    ): void;
    registerTool(tool: Record<string, any>): void;
    getCommands(): Array<Record<string, any>>;
  }
}

declare module "@earendil-works/pi-tui" {
  export class Text {
    constructor(text: string, x?: number, y?: number);
  }
}

declare module "typebox" {
  export const Type: {
    [key: string]: (...args: any[]) => any;
  };
}
