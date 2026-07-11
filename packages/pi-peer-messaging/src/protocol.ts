/**
summary: "Declares the discriminated client-to-broker and broker-to-client message unions for peer transport."
read_when:
  - "Adding a broker frame type or changing fields exchanged across the peer socket protocol."
*/
import type { PeerMessage, PeerPresence } from "./contracts.ts";
import type { PeerPresenceUpdate, PeerRegistration } from "./presence.ts";

export type PeerClientMessage =
  | { type: "register"; session: PeerRegistration }
  | { type: "unregister" }
  | { type: "list"; requestId: string }
  | ({ type: "presence" } & PeerPresenceUpdate)
  | { type: "send"; to: string; message: PeerMessage };

export type PeerBrokerMessage =
  | { type: "registered"; sessionId: string; self: PeerPresence }
  | { type: "sessions"; requestId: string; sessions: PeerPresence[] }
  | { type: "message"; from: PeerPresence; message: PeerMessage }
  | { type: "presence_update"; session: PeerPresence }
  | { type: "session_joined"; session: PeerPresence }
  | { type: "session_left"; sessionId: string }
  | { type: "delivered"; messageId: string }
  | { type: "delivery_failed"; messageId: string; reason: string }
  | { type: "error"; error: string };
