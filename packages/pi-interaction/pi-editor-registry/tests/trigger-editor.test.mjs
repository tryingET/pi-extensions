import assert from "node:assert/strict";
import test from "node:test";

import { TriggerEditor } from "../index.js";

test("TriggerEditor includes session cwd and session key in trigger context and API ctx", () => {
  const sessionCtx = { cwd: "/tmp/softwareco/owned/demo", sessionKey: "session-1" };
  const editor = new TriggerEditor({}, {}, {}, { id: "pi" }, {}, sessionCtx);

  editor.getCursor = () => ({ line: 0, col: 7 });
  editor.getLines = () => ["/vault:"];

  const context = editor.getContext(true);
  const api = editor.createAPI();

  assert.equal(context.cwd, sessionCtx.cwd);
  assert.equal(context.sessionKey, sessionCtx.sessionKey);
  assert.equal(api.ctx.cwd, sessionCtx.cwd);
  assert.equal(api.ctx.sessionKey, sessionCtx.sessionKey);
  assert.deepEqual(api.ctx.pi, { id: "pi" });
  assert.equal(editor.createAPI(), api);
});
