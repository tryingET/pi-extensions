// ---
// summary: "exposes a sandboxed renderer subscription API for activity-strip snapshot IPC messages"
// read_when:
//   - "changing the preload bridge or renderer snapshot subscription contract"
// ---

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("activityStrip", {
  activate(sessionId) {
    return ipcRenderer.invoke("pi-activity-strip:focus", String(sessionId ?? ""));
  },
  setExpanded(expanded) {
    return ipcRenderer.invoke("pi-activity-strip:set-expanded", Boolean(expanded));
  },
  subscribe(handler) {
    if (typeof handler !== "function") return () => {};
    const listener = (_event, snapshot) => handler(snapshot);
    ipcRenderer.on("pi-activity-strip:snapshot", listener);
    return () => ipcRenderer.removeListener("pi-activity-strip:snapshot", listener);
  },
});
