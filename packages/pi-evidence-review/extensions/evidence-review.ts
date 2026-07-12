import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverEvidenceReviewFiles, readEvidenceReviewFile } from "../src/reader.ts";
import { EvidenceReviewPanel, reviewDisplayLines } from "../src/render.ts";

export const COMMAND_NAME = "evidence-review";
export const HEADLESS_ERROR =
  "evidence-review requires interactive TUI mode; no file was read and no effects occurred";

export default function evidenceReviewExtension(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_NAME, {
    description: "Select or render one workspace-contained SCI evidence_review.v1 JSON file",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") throw new Error(HEADLESS_ERROR);

      let namedPath = args.trim();
      if (namedPath !== args || /[\r\n\0]/u.test(namedPath)) {
        ctx.ui.notify(
          "Evidence review rejected: name exactly one workspace-relative JSON file.",
          "error",
        );
        return;
      }

      if (!namedPath) {
        try {
          const discovery = await discoverEvidenceReviewFiles(ctx.cwd);
          if (discovery.files.length === 0) {
            ctx.ui.notify(
              discovery.truncated
                ? "No valid evidence review files found within the bounded workspace scan."
                : "No valid evidence review files found in this workspace.",
              "warning",
            );
            return;
          }
          const selected = await ctx.ui.select("Select evidence review file", discovery.files);
          if (!selected) return;
          namedPath = selected;
        } catch {
          ctx.ui.notify("Evidence review discovery failed closed.", "error");
          return;
        }
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
