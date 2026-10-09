/**
 * Models naturally copy the rendered `revision:<alias>` header line. Accept both
 * forms by stripping one optional header prefix and surrounding whitespace.
 */
export function normalizeRevisionAlias(value: any): any;
export class SnapshotEditService {
    /**
     * @param {{
     *   store?: SnapshotStore,
     *   mutationQueue?: (
     *     path: string,
     *     operation: () => Promise<{text: string, details: Record<string, unknown>}>
     *   ) => Promise<{text: string, details: Record<string, unknown>}>
     * }} [options]
     */
    constructor({ store, mutationQueue }?: {
        store?: SnapshotStore;
        mutationQueue?: (path: string, operation: () => Promise<{
            text: string;
            details: Record<string, unknown>;
        }>) => Promise<{
            text: string;
            details: Record<string, unknown>;
        }>;
    });
    store: SnapshotStore;
    mutationQueue: (path: string, operation: () => Promise<{
        text: string;
        details: Record<string, unknown>;
    }>) => Promise<{
        text: string;
        details: Record<string, unknown>;
    }>;
    read({ path, offset, limit }: {
        path: any;
        offset?: number;
        limit?: number;
    }, cwd: any): Promise<{
        text: string;
        details: {
            revision: any;
            digest: any;
            lineCount: any;
            offset: number;
            returnedLines: number;
            truncated: boolean;
        };
    }>;
    edit({ path, base, edits }: {
        path: any;
        base: any;
        edits: any;
    }, cwd: any, signal: any): Promise<{
        text: string;
        details: Record<string, unknown>;
    }>;
    clear(): void;
    stats(): {
        count: number;
        bytes: number;
    };
}
import { SnapshotStore } from "./snapshot-store.js";
