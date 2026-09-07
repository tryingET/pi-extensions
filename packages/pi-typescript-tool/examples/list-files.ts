// Submit this expression as the typescript tool's code argument in a trusted workspace.
async ({ fs }: ToolCapabilities) =>
  (await fs.list("."))
    .filter((entry) => entry.kind === "file")
    .map((entry) => ({ name: entry.name, bytes: entry.size }));
