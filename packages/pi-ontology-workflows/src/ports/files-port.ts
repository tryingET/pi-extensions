export interface FilesPort {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  readJson<T>(path: string): Promise<T>;
}
