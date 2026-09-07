export declare function launchRestrictedTaskSessionWindow(
  attempt: string,
  cwd: string,
  exec: (
    command: string,
    args: string[],
    options: { cwd: string; timeout: number },
  ) => Promise<{ code: number; stdout?: string; stderr?: string; killed?: boolean }>,
): Promise<{ ok: boolean; effectDisposition?: string; code: number; killed: boolean }>;
