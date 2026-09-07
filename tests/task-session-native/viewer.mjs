// Real Pi viewer readiness/stop bridge, no Ghostty, desktop or claimed placement proof.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2],
  attempt = process.argv[3];
const config = JSON.parse(readFileSync(join(root, "fixture.json")));
const { runViewer } = await import(`${config.dist}/viewer.js`);
await runViewer(config.locator, attempt, (_inspect, _stop, quit) => {
  const timer = setInterval(() => {
    if (existsSync(join(root, "quit-viewer"))) {
      clearInterval(timer);
      quit();
    }
  }, 20);
  return () => clearInterval(timer);
});
