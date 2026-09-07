import { createRequire } from "node:module";
import { refuse } from "./json.js";

interface Native {
  openMutex(path: string): object;
  mutexIdentity(handle: object): { dev: number; ino: number };
  tryLock(handle: object): boolean;
  unlockMutex(handle: object): void;
  closeMutex(handle: object): void;
  adoptCustody(): void;
  detachChannel(): number;
  closeCustody(): void;
}
let loaded: Native | undefined;
export function native(): Native {
  if (process.platform !== "linux" || process.arch !== "x64") refuse("native_platform_unsupported");
  loaded ??= createRequire(import.meta.url)("./custody-linux-x64.node") as Native;
  return loaded;
}
