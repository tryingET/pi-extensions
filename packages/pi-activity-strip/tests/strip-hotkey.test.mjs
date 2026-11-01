import assert from "node:assert/strict";
import test from "node:test";
import {
  findFocusStripChord,
  humanizeChord,
  resolveStripHotkey,
} from "../src/native/strip-hotkey.mjs";

/** One node per line inside the single `binds` section niri accepts. @param {string[]} lines */
const binds = (...lines) => `binds {\n${lines.map((line) => `    ${line}`).join("\n")}\n}\n`;
const action = '"node" "/x/pi-activity-strip.mjs" "focus-strip"';
const liveBind = `Mod+Shift+A { spawn ${action}; }`;
const A = "Mod+Shift+A";

/**
 * Every fixture records what niri's own parser says about its exact text (`niri validate -c`,
 * niri 26.04, KDL v1); a hint may only come from a config niri loads. Schema checks (duplicate
 * chords, unknown keys, nodes or type names) are out of scope: no fixture expecting a chord relies
 * on them, and those that niri rejects only for schema reasons expect no hint for their own.
 * @type {{given: string; text: string; chord: string | null; niri: "valid" | "invalid"}[]}
 */
export const HOTKEY_CASES = [
  // A real shortcut survives comments, disabled nodes, escapes and every KDL line ending.
  { given: "a live bind", text: binds(liveBind), chord: A, niri: "valid" },
  {
    given: "a comment glued to the chord",
    text: binds(`Mod+Shift+A/*c*/ { spawn ${action}; }`),
    chord: A,
    niri: "valid",
  },
  {
    given: "a comment glued to the action",
    text: binds(`Mod+Shift+A { spawn/*c*/ ${action}; }`),
    chord: A,
    niri: "valid",
  },
  {
    given: "an inline comment and a quoted path containing comment markers",
    text: binds('Mod+K /* comment */ { spawn "node" "/x//pi-activity-strip.mjs" "focus-strip"; }'),
    chord: "Mod+K",
    niri: "valid",
  },
  {
    given: "a nested block comment hiding another bind",
    text: `/* outer /* nested */\nMod+Z { spawn ${action}; }\n*/\n${binds(liveBind)}`,
    chord: A,
    niri: "valid",
  },
  {
    given: "a disabled top-level bind",
    text: `/- Mod+Z { spawn ${action}; }\n${binds(liveBind)}`,
    chord: A,
    niri: "valid",
  },
  {
    given: "a disabled binds section",
    text: `/- binds {\n    Mod+Z { spawn ${action}; }\n}\n${binds(liveBind)}`,
    chord: A,
    niri: "valid",
  },
  {
    given: "a raw string containing a bind lookalike",
    text: `screenshot-path r#"\nMod+Z { spawn ${action}; }\n"#\n${binds(liveBind)}`,
    chord: A,
    niri: "valid",
  },
  {
    given: "a commented-out action",
    text: binds(`Mod+Z { /* spawn ${action}; */ spawn "ghostty"; }`, liveBind),
    chord: A,
    niri: "valid",
  },
  {
    given: "a disabled action",
    text: binds(`Mod+Z { /- spawn ${action}; spawn "ghostty"; }`, liveBind),
    chord: A,
    niri: "valid",
  },
  {
    given: "a descriptive property mentioning the command",
    text: binds(
      'Mod+Z hotkey-overlay-title="pi-activity-strip focus-strip " { spawn "ghostty"; }',
      liveBind,
    ),
    chord: A,
    niri: "valid",
  },
  {
    given: "a KDL unicode escape elsewhere",
    text: binds('Mod+B { spawn "echo" "\\u{1F600}"; }', liveBind),
    chord: A,
    niri: "valid",
  },
  {
    given: "a literal tab inside a string elsewhere",
    text: binds('Mod+B { spawn "echo" "a\tb"; }', liveBind),
    chord: A,
    niri: "valid",
  },
  {
    given: "a multi-line string elsewhere",
    text: binds('Mod+B { spawn "echo" "a\nb"; }', liveBind),
    chord: A,
    niri: "valid",
  },
  {
    given: "a line continuation with a trailing comment",
    text: binds(`Mod+Shift+A \\ // wrapped\n    { spawn ${action}; }`),
    chord: A,
    niri: "valid",
  },
  {
    given: "escaped slashes in the command path",
    text: binds('Mod+Shift+A { spawn "node" "\\/x\\/pi-activity-strip.mjs" "focus-strip"; }'),
    chord: A,
    niri: "valid",
  },
  {
    given: "a quoted chord",
    text: binds(`"Mod+Shift+A" { spawn ${action}; }`),
    chord: A,
    niri: "valid",
  },
  {
    given: "a raw-string argument and property key",
    text: binds(
      'Mod+Shift+A r"repeat"=false { spawn r#"node"# "/x/pi-activity-strip.mjs" "focus-strip"; }',
    ),
    chord: A,
    niri: "valid",
  },
  {
    given: "a quoted property key and numeric properties",
    text: binds(`Mod+Shift+A "repeat"=false cooldown-ms=150 { spawn ${action}; }`),
    chord: A,
    niri: "valid",
  },
  {
    given: "numbers elsewhere in the config",
    text: `layout {\n    gaps 16\n}\n${binds(liveBind)}`,
    chord: A,
    niri: "valid",
  },
  {
    given: "a semicolon after a bind's children",
    text: binds(`${liveBind};`),
    chord: A,
    niri: "valid",
  },
  {
    given: "a line comment terminating the action",
    text: binds(`Mod+Shift+A { spawn ${action} // ends spawn\n    }`),
    chord: A,
    niri: "valid",
  },
  {
    given: "no spaces inside the braces",
    text: binds(`Mod+Shift+A {spawn ${action};}`),
    chord: A,
    niri: "valid",
  },
  {
    given: "a disabled argument followed by a space",
    text: binds(`Mod+Shift+A { spawn /- "x" ${action}; }`),
    chord: A,
    niri: "valid",
  },
  ...[
    ["CRLF", "\r\n"],
    ["CR", "\r"],
    ["NEL", "\u0085"],
    ["form-feed", "\f"],
    ["line-separator", "\u2028"],
  ].map(([name, newline]) => ({
    given: `${name} line endings`,
    text: binds(liveBind).replaceAll("\n", newline),
    chord: A,
    niri: /** @type {const} */ ("valid"),
  })),
  { given: "a byte-order mark", text: `\uFEFF${binds(liveBind)}`, chord: A, niri: "valid" },
  {
    given: "a byte-order mark after a string",
    text: binds(`Mod+Shift+A { spawn "node"\u{FEFF}"/x/pi-activity-strip.mjs" "focus-strip"; }`),
    chord: A,
    niri: "valid",
  },
  {
    given: "identifiers starting with !, alone or after a sign",
    text: `/- !a\n/- +!x\n${binds(liveBind)}`,
    chord: A,
    niri: "valid",
  },
  {
    given: "a no-break space between arguments",
    text: binds(`Mod+Shift+A { spawn\u00A0${action}; }`),
    chord: A,
    niri: "valid",
  },
  // Text niri refuses to load binds nothing, so no shortcut may be advertised for it.
  {
    given: "a bind closed only by its section's brace",
    text: `binds { ${liveBind} }\n`,
    chord: null,
    niri: "invalid",
  },
  {
    given: "an action closed only by its bind's brace",
    text: binds(`Mod+Shift+A { spawn ${action} }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "an empty statement after the action",
    text: binds(`Mod+Shift+A { spawn ${action};; }`),
    chord: null,
    niri: "invalid",
  },
  { given: "a leading semicolon", text: binds(";", liveBind), chord: null, niri: "invalid" },
  {
    given: "a bare identifier as the command",
    text: binds('Mod+Shift+A { spawn node "/x/pi-activity-strip.mjs" "focus-strip"; }'),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a bare identifier as the subcommand",
    text: binds('Mod+Shift+A { spawn "node" "/x/pi-activity-strip.mjs" focus-strip; }'),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a slashdash glued to the action",
    text: binds(`Mod+Shift+A { spawn/-"x" ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a slashdash glued to an argument",
    text: binds('Mod+Shift+A { spawn "node"/-"x" "/x/pi-activity-strip.mjs" "focus-strip"; }'),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a slashdash glued to a property",
    text: binds(`Mod+Shift+A/-repeat=false { spawn ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "spaces around a property's equals sign",
    text: binds(`Mod+Shift+A repeat = false { spawn ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a space after a property's equals sign",
    text: binds(`Mod+Shift+A repeat= false { spawn ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  // niri's KDL v1 parser takes escaped strings, never raw strings, as node names.
  {
    given: "a raw-string chord",
    text: binds(`r"Mod+Shift+A" { spawn ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a raw-string action name",
    text: binds(`Mod+Shift+A { r#"spawn"# ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a KDL v2 raw string",
    text: binds('Mod+Shift+A { spawn #"node"# "/x/pi-activity-strip.mjs" "focus-strip"; }'),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a KDL v2 boolean",
    text: binds(`Mod+Shift+A repeat=#false { spawn ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a JSON-style unicode escape elsewhere",
    text: binds('Mod+B { spawn "echo" "\\u0041"; }', liveBind),
    chord: null,
    niri: "invalid",
  },
  {
    given: "an unknown string escape elsewhere",
    text: binds('Mod+B { spawn "echo" "\\q"; }', liveBind),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a surrogate unicode escape elsewhere",
    text: binds('Mod+B { spawn "echo" "\\u{D800}"; }', liveBind),
    chord: null,
    niri: "invalid",
  },
  {
    given: "an over-long unicode escape elsewhere",
    text: binds('Mod+B { spawn "echo" "\\u{1234567}"; }', liveBind),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a line continuation between nodes",
    text: binds('Mod+B { spawn "x"; }', "\\", liveBind),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a keyword used as a node name",
    text: binds('true { spawn "x"; }', liveBind),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a vertical tab between arguments",
    text: binds(`Mod+Shift+A { spawn\v${action}; }`),
    chord: null,
    niri: "invalid",
  },
  // niri allows ! only as an identifier's first character, and a byte-order mark directly after a
  // bare word joins that word instead of separating it.
  {
    given: "a ! inside an identifier elsewhere",
    text: `${binds(liveBind)}/- note!\n`,
    chord: null,
    niri: "invalid",
  },
  {
    given: "a ! inside the chord",
    text: binds(`Mod+Shift+A! { spawn ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a ! in the middle of an identifier elsewhere",
    text: `${binds(liveBind)}/- no!te\n`,
    chord: null,
    niri: "invalid",
  },
  {
    given: "a byte-order mark glued before a property",
    text: binds(`Mod+Shift+A\u{FEFF}repeat=false { spawn ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a byte-order mark glued to the action",
    text: binds(`Mod+Shift+A { spawn\u{FEFF}${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a byte-order mark glued to the chord",
    text: binds(`Mod+Shift+A\u{FEFF}{ spawn ${action}; }`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "a disabled node followed by a node on the same line",
    text: binds(`/- Mod+B { spawn "x"; } ${liveBind}`),
    chord: null,
    niri: "invalid",
  },
  {
    given: "adjacent strings",
    text: binds('Mod+Shift+A { spawn "node""/x/pi-activity-strip.mjs""focus-strip"; }'),
    chord: null,
    niri: "invalid",
  },
  {
    given: "an argument glued to its action",
    text: binds('Mod+Shift+A { spawn"node" "/x/pi-activity-strip.mjs" "focus-strip"; }'),
    chord: null,
    niri: "invalid",
  },
  {
    given: "an unterminated sibling bind",
    text: binds(`${liveBind} Mod+B { spawn "ghostty"; }`),
    chord: null,
    niri: "invalid",
  },
  { given: "an unterminated comment", text: `${binds(liveBind)}/*`, chord: null, niri: "invalid" },
  {
    given: "a missing closing brace",
    text: `binds {\n    ${liveBind}\n`,
    chord: null,
    niri: "invalid",
  },
  {
    given: "a type annotation elsewhere",
    text: binds('Mod+B { spawn (t)"ghostty"; }', liveBind),
    chord: null,
    niri: "invalid",
  },
  ...["[", "]", ",", "<", ">", "(", ")"].flatMap((reserved) => [
    {
      given: `a reserved ${reserved} after the binds section`,
      text: `${binds(liveBind)}${reserved}invalid\n`,
      chord: null,
      niri: /** @type {const} */ ("invalid"),
    },
    {
      given: `a reserved ${reserved} inside the action`,
      text: binds(`Mod+Shift+A { spawn ${action} ${reserved}; }`),
      chord: null,
      niri: /** @type {const} */ ("invalid"),
    },
  ]),
  {
    given: "a bind-shaped node outside any binds section",
    text: `other {\n    Mod+Z { spawn ${action}; }\n}\n`,
    chord: null,
    niri: "invalid",
  },
  // Deliberate limits: type annotations are not parsed and shell strings are never evaluated.
  {
    given: "a type annotation in a disabled node",
    text: `/- a (t)"x"\n${binds(liveBind)}`,
    chord: null,
    niri: "valid",
  },
  {
    given: "a spawn-sh shell command",
    text: binds('Mod+Shift+A { spawn-sh "node /x/pi-activity-strip.mjs focus-strip"; }'),
    chord: null,
    niri: "valid",
  },
];

for (const { given, text, chord, niri } of HOTKEY_CASES) {
  test(`Given ${given}, When discovering the focus-strip hotkey, Then ${chord ? `only ${chord} is advertised` : "no shortcut is invented"}`, () => {
    assert.ok(chord === null || niri === "valid", "a hint may only come from a config niri loads");
    assert.equal(findFocusStripChord(text), chord);
    assert.equal(
      resolveStripHotkey({ env: {}, readFileSync: () => text, homeDir: "/fixture" }),
      chord && humanizeChord(chord),
    );
  });
}

const config = `binds {
    Mod+Return hotkey-overlay-title="Terminal" { spawn "ghostty"; }
    // Mod+Shift+Z { spawn "node" "/x/pi-activity-strip/bin/pi-activity-strip.mjs" "focus-strip"; }
    Mod+Shift+A repeat=false allow-inhibiting=false hotkey-overlay-title="Toggle Pi Activity Ribbon keyboard mode" { spawn "/usr/bin/node" "/home/u/pi-extensions/packages/pi-activity-strip/bin/pi-activity-strip.mjs" "focus-strip"; }
    Mod+Shift+S { spawn "node" "/home/u/pi-extensions/packages/pi-activity-strip/bin/pi-activity-strip.mjs" "status"; }
}`;

test("the hint names the chord the compositor actually binds to focus-strip", () => {
  assert.equal(
    findFocusStripChord(config),
    "Mod+Shift+A",
    "comments and other subcommands never count",
  );
  assert.equal(
    findFocusStripChord(binds('Mod+K { spawn "x"; }')),
    null,
    "a loadable bind elsewhere",
  );
  assert.equal(humanizeChord("Mod+Shift+A"), "Super+Shift+A");
  const read = (text) => () => text;
  assert.equal(
    resolveStripHotkey({ env: {}, readFileSync: read(config), homeDir: "/h" }),
    "Super+Shift+A",
  );
  assert.equal(
    resolveStripHotkey({
      env: {},
      readFileSync: () => {
        throw new Error("ENOENT");
      },
      homeDir: "/h",
    }),
    null,
    "no config, no guessed shortcut",
  );
  assert.equal(resolveStripHotkey({ env: { PI_ACTIVITY_STRIP_HOTKEY: "Alt+F1" } }), "Alt+F1");
  assert.equal(
    resolveStripHotkey({ env: { PI_ACTIVITY_STRIP_HOTKEY: "none" }, readFileSync: read(config) }),
    null,
  );
  let readPath = "";
  resolveStripHotkey({
    env: { XDG_CONFIG_HOME: "/cfg" },
    readFileSync: (file) => {
      readPath = String(file);
      return config;
    },
    homeDir: "/h",
  });
  assert.equal(readPath, "/cfg/niri/config.kdl");
});
