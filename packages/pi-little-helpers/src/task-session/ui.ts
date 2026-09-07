import { ProcessTerminal, TuiMainScreen, truncateToWidth } from "@earendil-works/pi-tui";
export interface ViewObservation {
  identity: Record<string, string>;
  phase: string;
  denial: string | null;
  events: Record<string, unknown>[];
}
const safe = (s: string) =>
  [...s]
    .map((c) => {
      const n = c.charCodeAt(0);
      return n < 32 || (n >= 127 && n <= 159) ? " " : c;
    })
    .join("");
/** Internal render/input component shared by the real TUI and synthetic tests. */
export function restrictedViewComponent(
  inspect: () => ViewObservation,
  stop: () => Promise<void>,
  quit: () => void,
  render: () => void,
) {
  let notice = "s / Ctrl-C stop future dispatch; q quit view (not cancellation)";
  return {
    invalidate() {},
    render(width: number) {
      const o = structuredClone(inspect());
      return [
        JSON.stringify(o.identity),
        `${o.phase}: ${o.denial ?? ""}`,
        notice,
        ...o.events.slice(-20).map((e) => (e.type === "text" ? String(e.text) : JSON.stringify(e))),
      ].map((s) => truncateToWidth(safe(s), width));
    },
    handleInput(data: string) {
      if (data === "q") quit();
      else if (data === "s" || data === "\x03") {
        notice = "Stopping future dispatch; started effects and claim remain owner-held.";
        void Promise.resolve()
          .then(stop)
          .catch(() => {
            notice = "Stop unconfirmed; inspect custody. No release/recovery was requested.";
          })
          .finally(render);
      } else {
        notice = "Secondary input is unsupported and was not submitted.";
        render();
      }
    },
  };
}
/** Copied observations and stop only. No submit/editor/provider/session/descriptor capability. */
export function taskSessionView(
  inspect: () => ViewObservation,
  stop: () => Promise<void>,
  onQuit: () => void = () => {},
) {
  const tui = new TuiMainScreen(new ProcessTerminal());
  let timer: ReturnType<typeof setInterval> | undefined;
  const quit = () => {
    if (timer) clearInterval(timer);
    tui.stop();
    onQuit();
  };
  const component = restrictedViewComponent(inspect, stop, quit, () => tui.requestRender());
  tui.addChild(component);
  tui.setFocus(component);
  try {
    tui.start();
    timer = setInterval(() => tui.requestRender(), 200);
  } catch (error) {
    quit();
    throw error;
  }
  return quit;
}
