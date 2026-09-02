// summary: registers the exact public sidequest, peer, and visible-loop command contract in stable order.
// read_when:
//   - changing sidequest command names, descriptions, handlers, or registration order.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { LITTLE_HELPERS_COMMAND_NAMES } from "../src/capabilityManifest.ts";
import {
  NEXUS_LOOP_COMMAND,
  VISIBLE_LOOP_CHILD_COMMAND,
  VISIBLE_LOOP_CHILD_COMPLETE_COMMAND,
  VISIBLE_LOOP_COMMAND,
} from "../src/visibleLoop.ts";

type CommandHandler = Parameters<ExtensionAPI["registerCommand"]>[1]["handler"];

export type SidequestCommandHandlers = {
  freshHandoff: CommandHandler;
  sidequest: CommandHandler;
  scoutPeer: CommandHandler;
  parallelQuest: CommandHandler;
  visibleLoop: CommandHandler;
  nexusLoop: CommandHandler;
  visibleLoopChild: CommandHandler;
  visibleLoopChildComplete: CommandHandler;
};

export function registerSidequestCommands(
  pi: ExtensionAPI,
  handlers: SidequestCommandHandlers,
): void {
  const [SIDEQUEST_COMMAND, SCOUTPEER_COMMAND, PARALLELQUEST_COMMAND, FRESH_HANDOFF_COMMAND] =
    LITTLE_HELPERS_COMMAND_NAMES;

  pi.registerCommand(FRESH_HANDOFF_COMMAND, {
    description:
      "Generate a self-contained handoff and auto-submit it in a fresh clean Ghostty Pi session. Unscoped child cwd receives company provenance automatically; session mode is not a company switch",
    handler: handlers.freshHandoff,
  });

  pi.registerCommand(SIDEQUEST_COMMAND, {
    description:
      "Fork the current Pi session into a visible Ghostty peer. Unscoped child cwd receives company provenance automatically",
    handler: handlers.sidequest,
  });

  pi.registerCommand(SCOUTPEER_COMMAND, {
    description:
      "Launch a clean visible read-only scout/review peer in the current workspace. Unscoped child cwd receives company provenance automatically",
    handler: handlers.scoutPeer,
  });

  pi.registerCommand(PARALLELQUEST_COMMAND, {
    description:
      "Launch a one-shot candidate peer only after owner authorization for the exact repository and objective; blocked admission must not be retried unchanged. Isolated worktrees receive controller company provenance automatically",
    handler: handlers.parallelQuest,
  });

  pi.registerCommand(VISIBLE_LOOP_COMMAND, {
    description:
      "Launch a visible Ghostty Pi tab that runs the default prompt sequence for N iterations",
    handler: handlers.visibleLoop,
  });

  pi.registerCommand(NEXUS_LOOP_COMMAND, {
    description:
      "Launch a visible Ghostty Pi tab that loops deep-review, nexus implementation, atomic-completion, and commit",
    handler: handlers.nexusLoop,
  });

  pi.registerCommand(VISIBLE_LOOP_CHILD_COMMAND, {
    description: "Internal helper for visible-loop launched child sessions",
    handler: handlers.visibleLoopChild,
  });

  pi.registerCommand(VISIBLE_LOOP_CHILD_COMPLETE_COMMAND, {
    description: "Internal helper that advances a visible-loop child iteration",
    handler: handlers.visibleLoopChildComplete,
  });
}
