import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readEvidenceReviewFile } from "../src/reader.ts";
import { EvidenceReviewPanel, reviewDisplayLines } from "../src/render.ts";

export const COMMAND_NAME = "evidence-review";
export const HEADLESS_ERROR =
  "evidence-review requires interactive TUI mode; no file was read and no effects occurred";

export default function evidenceReviewExtension(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_NAME, {
    description: "Render one explicitly named workspace-contained SCI evidence_review.v1 JSON file",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") throw new Error(HEADLESS_ERROR);

      const namedPath = args.trim();
      if (!namedPath || namedPath !== args || /[\r\n\0]/u.test(namedPath)) {
        ctx.ui.notify(
          "Evidence review rejected: name exactly one workspace-relative JSON file.",
          "error",
        );
        return;
      }

      try {
        const review = await readEvidenceReviewFile(ctx.cwd, namedPath);
        await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
          const panel = new EvidenceReviewPanel(reviewDisplayLines(review), () => done());
          return {
            render: (width: number) => panel.render(width),
            invalidate: () => panel.invalidate(),
            handleInput: (data: string) => {
              panel.handleInput(data);
              tui.requestRender();
            },
          };
        });
      } catch {
        ctx.ui.notify(
          "Evidence review rejected: the named file did not satisfy the bounded v1 contract.",
          "error",
        );
      }
    },
  });
}
