import type { WireMessage } from "./channel.js";
export declare function interpretTaskSessionMessage(value: unknown): WireMessage;
export declare function requireTaskSessionProducer(): void;

export declare function encodeTaskSessionStartup(input: unknown): unknown;

export declare function interpretTaskSessionPlan(data: unknown): unknown;
