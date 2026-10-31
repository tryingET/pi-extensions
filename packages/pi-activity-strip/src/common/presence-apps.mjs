// ---
// summary: "decides which focused non-agent applications keep the activity strip present"
// read_when:
//   - "changing which applications keep the strip visible, or the presence env override"
// ---

/**
 * Applications the operator works in beside the agents: the terminal family that hosts agent tabs
 * (and plain shells, nodecode, angelx, Cursor's `agent`), and the password manager reached for in
 * the middle of agent work. Focusing one of them keeps the strip on screen. Presence is a
 * visibility policy only; it never claims that the window owns a card.
 */
export const DEFAULT_PRESENCE_APP_IDS = Object.freeze([
  "com.mitchellh.ghostty",
  "com.tryinget.ghosttysidequest",
  "com.onepassword.OnePassword",
  "1Password",
]);

/** @type {Map<string, {all: boolean; ids: Set<string>}>} */
const parsed = new Map();

/**
 * `PI_ACTIVITY_STRIP_PRESENCE_APP_IDS` is a comma list applied to the defaults: `id` adds an app,
 * `-id` removes one, `none` drops every default, `*` keeps the strip present over every app.
 * App ids compare case-insensitively.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function presenceAppsFor(env = process.env) {
  const raw = String(env?.PI_ACTIVITY_STRIP_PRESENCE_APP_IDS ?? "");
  const cached = parsed.get(raw);
  if (cached) return cached;
  const ids = new Set(DEFAULT_PRESENCE_APP_IDS.map((id) => id.toLowerCase()));
  let all = false;
  for (const entry of raw.split(",").map((value) => value.trim().toLowerCase())) {
    if (!entry) continue;
    if (entry === "*") all = true;
    else if (entry === "none") {
      ids.clear();
      all = false;
    } else if (entry.startsWith("-")) ids.delete(entry.slice(1).trim());
    else ids.add(entry);
  }
  const result = { all, ids };
  parsed.set(raw, result);
  return result;
}

/** @param {unknown} appId @param {NodeJS.ProcessEnv} [env] */
export function isPresenceApp(appId, env = process.env) {
  const id = String(appId ?? "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  const apps = presenceAppsFor(env);
  return apps.all || apps.ids.has(id);
}
