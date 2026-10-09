export function resolveTextFile(inputPath: any, cwd: any): Promise<{
    canonicalPath: string;
    fileStat: import("fs").Stats;
    requestedWasSymlink: boolean;
    identity: {
        dev: number;
        ino: number;
    };
}>;
export function readFileState(canonicalPath: any): Promise<{
    bytes: NonSharedBuffer;
    fileStat: import("fs").Stats;
}>;
export function loadTextFile(canonicalPath: any): Promise<{
    bytes: Buffer<any>;
    text: string;
    hasBom: any;
    lines: {
        start: number;
        contentEnd: any;
        end: any;
        text: any;
    }[];
    preferredEol: string;
}>;
export function decodeTextBytes(bytes: any, label?: string): {
    bytes: Buffer<any>;
    text: string;
    hasBom: any;
    lines: {
        start: number;
        contentEnd: any;
        end: any;
        text: any;
    }[];
    preferredEol: string;
};
export function indexLines(text: any): {
    start: number;
    contentEnd: any;
    end: any;
    text: any;
}[];
export function detectPreferredEol(text: any): "\r\n" | "\n";
/** Resolve every exact-text selector against the same immutable snapshot, then mutate. */
export function applyTextEdits(base: any, edits: any): Buffer<ArrayBuffer>;
export function atomicReplace(canonicalPath: any, bytes: any, expectedDigest: any, expectedIdentity: any, digestBytes: any, signal: any): Promise<{
    identity: {
        dev: number;
        ino: number;
    };
    mode: number;
}>;
