import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FilesPort } from "../ports/files-port.ts";

export function createFilesystemPort(): FilesPort {
  return {
    async exists(path: string): Promise<boolean> {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    async readText(path: string): Promise<string> {
      return readFile(path, "utf8");
    },
    async writeText(path: string, content: string): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    },
    async mkdirp(path: string): Promise<void> {
      await mkdir(path, { recursive: true });
    },
    async readJson<T>(path: string): Promise<T> {
      return JSON.parse(await readFile(path, "utf8")) as T;
    },
  };
}
