export function createOwnedRuntime<T extends object>(factory: () => T): T;

export function isOwnedRuntime(value: unknown): boolean;
