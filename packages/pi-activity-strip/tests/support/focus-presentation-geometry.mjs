// Real private-compositor oracle; projection messages alone are not geometry proof.
import assert from "node:assert/strict";
import fs from "node:fs";
import { selectEmptyWorkspace } from "./fixture-workspaces.mjs";

export async function checkFocusPresentationGeometry({
  agent,
  target,
  unreservedWindows,
  niri,
  run,
  focus,
  eventually,
  status,
  layers,
  traceFile,
}) {
  assert.equal(process.env.PI_ACTIVITY_STRIP_ISOLATED_GUI, "1");
  const state = JSON.parse(fs.readFileSync(process.env.PI_ACTIVITY_STRIP_GUI_STATE, "utf8"));
  assert.equal(state.outer_socket, null);
  assert.ok(process.env.NIRI_SOCKET.endsWith(`.${state.pid}.sock`));
  const trace = () =>
    fs
      .readFileSync(traceFile, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const latestView = () =>
    trace()
      .filter((row) => row.direction === "to-panel" && row.message.type === "view")
      .at(-1)?.message;
  const dimensions = (windows) =>
    windows
      .map((window) => {
        const height = window.layout?.window_size?.[1];
        assert.ok(
          Number.isFinite(height) && height > 0,
          "SETUP: real compositor window height required",
        );
        return [window.id, height];
      })
      .sort(([left], [right]) => left - right);
  const sourceWorkspace = (await niri("workspaces")).find(
    (workspace) => workspace.id === agent.workspace_id,
  );
  assert.ok(sourceWorkspace);
  const moveTarget = (idx) =>
    run("niri", [
      "msg",
      "action",
      "move-window-to-workspace",
      "--window-id",
      String(target.id),
      "--focus",
      "false",
      String(idx),
    ]);
  await moveTarget(sourceWorkspace.idx);
  try {
    // The caller measured these same windows with NO layer before starting the controller.
    // Do not toggle the zone during setup: asynchronous client configures can leave a mixed
    // vector that would falsely attribute late setup resizing to the first measured focus move.
    const withoutZone = new Map(dimensions(unreservedWindows));
    const reservedHeight = 84 + 8; // app.rs compact exclusive zone PLUS anchored top margin
    await focus(agent.id);
    // Given two admitted agent windows sharing the output and a compact, mapped ribbon.
    await eventually(async () => {
      const view = latestView();
      return (
        (await status())?.windowVisible === true &&
        view?.sessions.some((card) => card.windowId === agent.id) &&
        view?.sessions.some((card) => card.windowId === target.id) &&
        view.sessions.find((card) => card.cardId === view.focusedCardId)?.windowId === agent.id
      );
    }, "geometry: both real eligible windows admitted on the same workspace");
    assert.equal((await status())?.panelExpanded, false, "SETUP: compact, not an expanded overlay");
    const before = await eventually(async () => {
      const sizes = dimensions(await niri("windows"));
      return sizes.length === withoutZone.size &&
        sizes.every(([id, height]) => withoutZone.get(id) - height === reservedHeight)
        ? sizes
        : null;
    }, "geometry: every fixture settles at the real compact nonzero working-area reservation");
    console.log(
      "GEOMETRY SETUP calibrated",
      JSON.stringify({ unreserved: [...withoutZone], compact: before }),
    );
    const beforeLayer = (await layers()).filter((layer) => layer.namespace === "pi-activity-strip");
    assert.equal(beforeLayer.length, 1, "SETUP: actual compact layer must be mapped");
    const boundary = trace().length;
    let samples = 0;
    // When switching either direction, inspect real geometry during convergence, not just afterward.
    for (const id of [target.id, agent.id, target.id, agent.id]) {
      await focus(id);
      await eventually(async () => {
        const windows = await niri("windows");
        assert.deepEqual(
          dimensions(windows),
          before,
          "eligible switch changed application window heights",
        );
        assert.equal(
          (await layers()).filter((layer) => layer.namespace === "pi-activity-strip").length,
          1,
          "eligible switch unmapped the real ribbon layer",
        );
        samples += 1;
        const view = latestView();
        return (
          (await niri("focused-window"))?.id === id &&
          view?.visible === true &&
          view.sessions.find((card) => card.cardId === view.focusedCardId)?.windowId === id
        );
      }, `geometry: eligible focus ${id} converges without remap or resize`);
    }
    // Then no transient hide command or applied hide may be hidden by sampling or final-state recovery.
    const segment = trace().slice(boundary);
    const views = segment.filter(
      (row) => row.direction === "to-panel" && row.message.type === "view",
    );
    assert.ok(views.length > 0 && samples >= 4);
    assert.equal(
      views.every((row) => row.message.visible === true),
      true,
      "eligible handoff published a transient false-hide view",
    );
    assert.equal(
      segment.some(
        (row) =>
          row.direction === "from-panel" &&
          row.message.type === "visibility-applied" &&
          row.message.visible === false,
      ),
      false,
      "native applied a transient exclusive-zone removal",
    );
    console.log(
      "CONTROLLER PASS Given two eligible windows, When switching focus, Then all sampled application heights and the real mapped layer remain stable",
      JSON.stringify({ samples, views: views.length }),
    );
  } finally {
    // Restore the cross-workspace fixture using today's empty workspace, not a stale workspace id.
    const empty = selectEmptyWorkspace(
      await niri("workspaces"),
      await niri("windows"),
      agent.workspace_id,
    );
    assert.ok(empty, "private compositor must provide an empty fixture workspace");
    await moveTarget(empty.idx);
    await focus(agent.id);
    await eventually(
      async () =>
        (await status())?.rendererCardCount === 1 && (await status())?.windowVisible === true,
      "geometry: original cross-workspace fixture restored",
    );
  }
}
