const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("activityStrip", {
  subscribe(handler) {
    if (typeof handler !== "function") return () => {};
    const listener = (_event, snapshot) => handler(snapshot);
    ipcRenderer.on("pi-activity-strip:snapshot", listener);
    return () => ipcRenderer.removeListener("pi-activity-strip:snapshot", listener);
  },
});
