import { registerPiAutoresearchExtension } from "../../extensions/pi-autoresearch.ts";

const tools: Array<{ name: string; parameters: unknown }> = [];
registerPiAutoresearchExtension(
  {
    registerCommand() {},
    registerTool(tool: { name: string; parameters: unknown }) {
      tools.push(tool);
    },
  } as never,
  {
    triggerSurface: {
      registerPickerInteraction() {
        return { unregister() {} };
      },
    },
  },
);

const eagerContract = Object.fromEntries(
  tools
    .map((tool) => [tool.name, tool.parameters] as const)
    .sort(([left], [right]) => left.localeCompare(right)),
);
process.stdout.write(`${JSON.stringify(eagerContract)}\n`);
