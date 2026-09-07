// ---
// summary: "verifies Ghostty theme parsing, palette mapping, discovery, and the day/night switch"
// read_when:
//   - "changing how the ribbon follows the Ghostty theme"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRibbonPalette,
  FALLBACK_PALETTE,
  normalizeHexColor,
  paletteDefinitions,
  parseGhosttyConfig,
  parseGhosttyTheme,
  parseThemeSetting,
} from "../src/common/ghostty-theme.mjs";
import { createThemeRuntime } from "../src/native/theme-runtime.mjs";
import {
  detectColorScheme,
  ghosttyConfigPaths,
  resolveRibbonTheme,
  themeSourceFingerprint,
} from "../src/native/theme-source.mjs";

const DARK = [
  "palette = 1=#e67e80",
  "palette = 2=#a7c080",
  "palette = 3=#dbbc7f",
  "palette = 4=#7fbbb3",
  "background = #1e2326",
  "foreground = #d3c6aa",
  "cursor-color = #e69875",
].join("\n");
const LIGHT = [
  "palette = 1=#e67e80",
  "palette = 2=#9ab373",
  "palette = 3=#c1a266",
  "palette = 4=#7fbbb3",
  "background = #efebd4",
  "foreground = #5c6a72",
  "cursor-color = #f57d26",
].join("\n");

test("colours are normalized and anything else is refused", () => {
  assert.equal(normalizeHexColor("#AABBCC"), "#aabbcc");
  assert.equal(normalizeHexColor("aabbcc"), "#aabbcc");
  assert.equal(normalizeHexColor("#abc"), "#aabbcc");
  assert.equal(normalizeHexColor("rgb(1,2,3)"), "");
  assert.equal(normalizeHexColor(""), "");
  assert.equal(normalizeHexColor(null), "");
});

test("config parsing keeps repeated keys and ignores comments", () => {
  const entries = parseGhosttyConfig(
    ["# a comment", "", "theme = X", "palette = 0=#111111", "palette = 1=#222222", "bad line"].join(
      "\n",
    ),
  );
  assert.deepEqual(entries.get("palette"), ["0=#111111", "1=#222222"]);
  assert.deepEqual(entries.get("theme"), ["X"]);
  assert.equal(entries.has("bad line"), false);
});

test("a theme setting may name one theme or one per colour scheme", () => {
  assert.deepEqual(parseThemeSetting("light:Everforest Light Med,dark:Everforest Dark Hard"), {
    light: "Everforest Light Med",
    dark: "Everforest Dark Hard",
  });
  assert.deepEqual(parseThemeSetting("dark:Only Dark"), { light: "", dark: "Only Dark" });
  assert.deepEqual(parseThemeSetting("Solarized Dark"), {
    light: "Solarized Dark",
    dark: "Solarized Dark",
  });
  assert.deepEqual(parseThemeSetting(""), { light: "", dark: "" });
});

test("terminal colours map onto ribbon roles, and an unreadable theme falls back", () => {
  const dark = buildRibbonPalette(parseGhosttyTheme(DARK));
  assert.equal(dark.background, "#1e2326");
  assert.equal(dark.foreground, "#d3c6aa");
  assert.equal(dark.success, "#a7c080", "green means settled, as it does in the terminal");
  assert.equal(dark.error, "#e67e80");
  assert.equal(dark.tool, "#dbbc7f");
  assert.equal(dark.waiting, "#e69875", "the cursor colour marks a session that wants you");

  const light = buildRibbonPalette(parseGhosttyTheme(LIGHT));
  assert.equal(light.background, "#efebd4");
  assert.equal(light.success, "#9ab373");
  assert.notDeepEqual(light, dark, "the two schemes never resolve to the same palette");

  assert.deepEqual(buildRibbonPalette(null), { ...FALLBACK_PALETTE });
  assert.deepEqual(buildRibbonPalette(parseGhosttyTheme("background = #111111")), {
    ...FALLBACK_PALETTE,
  });
});

test("definitions name every role the stylesheet derives from", () => {
  const css = paletteDefinitions(buildRibbonPalette(parseGhosttyTheme(DARK)));
  for (const role of Object.keys(FALLBACK_PALETTE)) {
    assert.match(css, new RegExp(`@define-color pi_${role} #[0-9a-f]{6};`));
  }
  assert.match(paletteDefinitions({ background: "nonsense" }), /pi_background #000000;/);
});

function themeFs(files) {
  return {
    readFile: (filePath) => files[filePath] ?? "",
    exists: (filePath) => Object.hasOwn(files, filePath),
    mtime: (filePath) => (Object.hasOwn(files, filePath) ? 42 : 0),
  };
}

test("the configured theme is resolved per colour scheme from Ghostty's own files", () => {
  const home = "/home/x";
  const files = {
    "/home/x/.config/ghostty/config": "theme = light:Light Med,dark:Dark Hard\nfont-size = 11",
    "/home/x/.config/ghostty/themes": "",
    "/home/x/.config/ghostty/themes/Dark Hard": DARK,
    "/home/x/.config/ghostty/themes/Light Med": LIGHT,
  };
  const fsImpl = themeFs(files);
  const env = { XDG_CONFIG_HOME: "/home/x/.config" };

  const dark = resolveRibbonTheme({ scheme: "dark", env, homeDir: home, fs: fsImpl });
  assert.equal(dark.themeName, "Dark Hard");
  assert.equal(dark.palette.background, "#1e2326");
  const light = resolveRibbonTheme({ scheme: "light", env, homeDir: home, fs: fsImpl });
  assert.equal(light.themeName, "Light Med");
  assert.equal(light.palette.background, "#efebd4");
  assert.equal(
    resolveRibbonTheme({ scheme: "unknown", env, homeDir: home, fs: fsImpl }).themeName,
    "Dark Hard",
    "with no stated preference the dark theme is used",
  );

  const inline = resolveRibbonTheme({
    scheme: "dark",
    env,
    homeDir: home,
    fs: themeFs({
      ...files,
      "/home/x/.config/ghostty/config": `${files["/home/x/.config/ghostty/config"]}\nbackground = #000102`,
    }),
  });
  assert.equal(inline.palette.background, "#000102", "a config colour overrides the theme file");

  const missing = resolveRibbonTheme({ scheme: "dark", env, homeDir: home, fs: themeFs({}) });
  assert.deepEqual(missing.palette, { ...FALLBACK_PALETTE });
  assert.equal(themeSourceFingerprint(dark, fsImpl).includes("Dark Hard:42"), true);
  assert.equal(themeSourceFingerprint(null, fsImpl), "");
  assert.equal(ghosttyConfigPaths({ env, homeDir: home })[0], "/home/x/.config/ghostty/config");
});

test("the colour scheme comes from the desktop portal, and may be pinned", async () => {
  const portal = async () => ({ stdout: "(<uint32 1>,)" });
  assert.equal(await detectColorScheme({ execFileAsync: portal, env: {} }), "dark");
  assert.equal(
    await detectColorScheme({ execFileAsync: async () => ({ stdout: "(<uint32 2>,)" }), env: {} }),
    "light",
  );
  assert.equal(
    await detectColorScheme({ execFileAsync: async () => ({ stdout: "(<uint32 0>,)" }), env: {} }),
    "unknown",
  );
  assert.equal(
    await detectColorScheme({
      execFileAsync: async () => {
        throw new Error("no portal");
      },
      env: {},
    }),
    "unknown",
    "a desktop without the portal is not an error",
  );
  assert.equal(
    await detectColorScheme({
      execFileAsync: async () => assert.fail("must not ask the portal"),
      env: { PI_ACTIVITY_STRIP_COLOR_SCHEME: "light" },
    }),
    "light",
  );
});

test("the panel is only sent colours when they change, and always after it restarts", async () => {
  const published = [];
  const runtimeStatus = {};
  let scheme = "dark";
  const theme = createThemeRuntime({
    execFileAsync: async () => ({ stdout: "" }),
    env: {},
    runtimeStatus,
    publish: (definitions) => published.push(definitions),
    detectScheme: async () => scheme,
    resolveTheme: ({ scheme: active }) => ({
      scheme: active,
      themeName: active === "light" ? "Light Med" : "Dark Hard",
      configPath: "/c",
      themePath: "/t",
      palette: buildRibbonPalette(parseGhosttyTheme(active === "light" ? LIGHT : DARK)),
    }),
    fingerprint: () => "fp",
  });

  assert.equal(await theme.refresh(), true);
  assert.equal(published.length, 1);
  assert.match(published[0], /pi_background #1e2326;/);
  assert.equal(runtimeStatus.themeName, "Dark Hard");
  assert.equal(runtimeStatus.themeScheme, "dark");

  assert.equal(await theme.refresh(), false, "unchanged colours are not resent");
  assert.equal(published.length, 1);

  scheme = "light";
  assert.equal(await theme.refresh(), true, "a day/night switch republishes");
  assert.match(published[1], /pi_background #efebd4;/);

  theme.republish();
  assert.equal(published.length, 3, "a restarted panel gets the colours it lost");
  assert.equal(published[2], published[1]);

  const failing = createThemeRuntime({
    execFileAsync: async () => ({ stdout: "" }),
    env: {},
    runtimeStatus,
    publish: () => assert.fail("must not publish"),
    detectScheme: async () => {
      throw new Error("portal exploded");
    },
  });
  assert.equal(await failing.refresh(), false);
  assert.equal(runtimeStatus.themeError, "portal exploded");
});
