// An unfocused target agent workspace is NOT empty. Select by the actual window inventory,
// not active_window_id (which can be NULL while a layer owns focus).
export function selectEmptyWorkspace(workspaces, windows, sourceId) {
  const occupied = new Set(windows.map((window) => window.workspace_id));
  return workspaces.find(
    (workspace) =>
      Number.isInteger(workspace.id) && workspace.id !== sourceId && !occupied.has(workspace.id),
  );
}
