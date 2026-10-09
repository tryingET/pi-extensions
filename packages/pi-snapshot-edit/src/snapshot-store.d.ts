export function digestBytes(bytes: any): string;
export class SnapshotStore {
    constructor({ maxSnapshots, maxBytes, words }?: {
        maxSnapshots?: number;
        maxBytes?: number;
        words?: string[];
    });
    maxSnapshots: number;
    maxBytes: number;
    words: string[];
    snapshots: Map<any, any>;
    totalBytes: number;
    sequence: number;
    assertWithinByteBudget(bytes: any): void;
    add(snapshot: any): any;
    get(alias: any): any;
    /** Most recently added aliases, newest first; diagnostic hints only. */
    recentAliases(limit?: number): any[];
    clear(): void;
    stats(): {
        count: number;
        bytes: number;
    };
    #private;
}
