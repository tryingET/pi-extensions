// summary: best-effort local Muse usage recording, independent of the /limits display.
// read_when: changing finalized-message accounting registration or extension lifecycle.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type MetaMessageLike, recordMetaAssistantMessage } from "../lib/meta-usage-ledger.ts";

export function createMetaUsageLedgerExtension(
  recordMeta: (message: MetaMessageLike) => void = recordMetaAssistantMessage,
): (pi: ExtensionAPI) => void {
  return (pi) => {
    pi.on("message_end", (event) => {
      // Ledger writes are best-effort local accounting; they must never break a turn.
      try {
        recordMeta(event.message as MetaMessageLike);
      } catch {
        // ignore: quota display is optional, the turn is not
      }
    });
  };
}

export default createMetaUsageLedgerExtension();
