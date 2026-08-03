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
  onCollapse(handler) {
    if (typeof handler !== "function") return () => {};
    const listener = () => handler();
    ipcRenderer.on("pi-activity-strip:collapse", listener);
    return () => ipcRenderer.removeListener("pi-activity-strip:collapse", listener);
  },
  onVisibility(handler) {
    if (typeof handler !== "function") return () => {};
    let latestRequestId = 0;
    const listener = (_event, visible, requestId) => {
      if (!Number.isInteger(requestId) || requestId <= 0) return;
      latestRequestId = Math.max(latestRequestId, requestId);
      const isCurrent = () => requestId === latestRequestId;
      Promise.resolve()
        .then(() => handler(Boolean(visible), isCurrent))
        .then((applied) =>
          ipcRenderer.send(
            "pi-activity-strip:visibility-applied",
            requestId,
            Boolean(visible),
            applied !== false,
          ),
        )
        .catch(() => {});
    };
    ipcRenderer.on("pi-activity-strip:visibility", listener);
    return () => ipcRenderer.removeListener("pi-activity-strip:visibility", listener);
  },
  subscribe(handler) {
    if (typeof handler !== "function") return () => {};
    const listener = (_event, snapshot) => handler(snapshot);
    ipcRenderer.on("pi-activity-strip:snapshot", listener);
    return () => ipcRenderer.removeListener("pi-activity-strip:snapshot", listener);
  },
});
