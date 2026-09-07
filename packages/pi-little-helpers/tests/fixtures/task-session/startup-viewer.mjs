import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { restrictedViewComponent } from "../../../dist/task-session/ui.js";
import { runViewer } from "../../../dist/task-session/viewer.js";

const root = process.argv[2],
  attempt = process.argv[3];
const { locator } = JSON.parse(readFileSync(join(root, "fixture.json"), "utf8"));
await runViewer(locator, attempt, (inspect, stop, quit) => {
  const component = restrictedViewComponent(
    inspect,
    stop,
    () => {
      clearInterval(timer);
      quit();
    },
    () => {},
  );
  let action = "";
  const timer = setInterval(() => {
    writeFileSync(join(root, "render.json"), JSON.stringify(component.render(120)));
    if (existsSync(join(root, "viewer-action"))) {
      const next = readFileSync(join(root, "viewer-action"), "utf8");
      if (next !== action) {
        action = next;
        component.handleInput(action);
      }
    }
  }, 30);
  return () => clearInterval(timer);
});
