#!/usr/bin/env node
// This import closure contains only node builtins and the packaged native bridge. No SDK import.
import { native } from "./native.js";

let adopted = false;
try {
  native().adoptCustody();
  adopted = true;
  if (process.argv.length !== 2) throw new Error("host_arguments_forbidden");
  const { openAdoptedChannel } = await import("./socket-channel.js");
  const channel = openAdoptedChannel();
  const { accountLocator } = await import("./state.js");
  const { runHost } = await import("./startup.js");
  const { interpretTaskSessionMessage } = await import("./producer-adapter.js");
  const { requireInstalledProducer } = await import("./producer.js");
  const locator = accountLocator();
  const producer = await requireInstalledProducer(locator);
  const result = await runHost(
    channel,
    locator,
    { send: (url, init) => fetch(url, init) },
    interpretTaskSessionMessage,
    producer,
  );
  if (result.closedVerified) {
    native().closeCustody();
    process.exitCode = result.promptReturned && !result.reason ? 0 : 2;
  } else throw new Error("custody_retained");
} catch {
  process.stderr.write("task_session_host_denied_custody_retained\n");
  // EOF, timeout, import or setup failure is NOT permission to release the inherited OFD.
  if (adopted) setInterval(() => {}, 60000);
  else process.exitCode = 2;
}
