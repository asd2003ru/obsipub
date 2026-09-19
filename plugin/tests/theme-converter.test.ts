import assert from "node:assert/strict";
import test from "node:test";
import { parseTaintedYAML, generateThemeCSS, sanitizeSchemeId } from "../src/theme-converter";

test("parses tinted YAML safely without eval", () => {
  const yaml = `scheme:
  name: "Nord"
  system: "tinted8"
  variant: "dark"
palette:
  black: "#2e3440"
  white: "#e5e9f0"
  blue: "#81a1c1"
  gray: "#616E88"
  red: "#bf616a"
ui:
  border.normal: "#3b4252"
`;
  const parsed = parseTaintedYAML(yaml);
  assert.equal(parsed.name, "Nord");
  assert.equal(parsed.system, "tinted8");
  assert.equal(parsed.variant, "dark");
  assert.equal(parsed.palette?.black, "#2e3440");
  assert.equal(parsed.palette?.white, "#e5e9f0");
  assert.equal(parsed.ui?.["border.normal"], "#3b4252");
});

test("generates self-contained CSS with light and dark selectors", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "Test"
  system: "base16"
palette:
  black: "#000000"
  white: "#ffffff"
`);
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("body.theme-light"));
  assert.ok(css.includes("body.theme-dark"));
  assert.ok(css.includes("--bg:"));
  assert.ok(css.includes("--accent:"));
  assert.ok(!css.includes("@import"));
  assert.ok(!css.includes("url("));
});

test("uses Tinted8 semantic UI colors instead of only terminal palette", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "Catppuccin Mocha"
  system: "tinted8"
  variant: "dark"
palette:
  black: "#1e1e2e"
  white: "#cdd6f4"
  blue: "#89b4fa"
ui:
  chrome.background.dark: "#181825"
  highlight.text.foreground: "#f5c2e7"
  border.normal: "#313244"
`);
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--bg: #181825"));
  assert.ok(css.includes("--text: #f5c2e7"));
  assert.ok(css.includes("--border: #313244"));
});

test("accepts legacy Base16/Base24 palette keys", () => {
  const parsed = parseTaintedYAML(`scheme:\n  name: "Legacy"\nbase00: "1e1e2e"\nbase05: "cdd6f4"\nbase0D: "89b4fa"\n`);
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--bg: #1e1e2e"));
  assert.ok(css.includes("--text: #cdd6f4"));
  assert.ok(css.includes("--accent: #89b4fa"));
});

test("generates one CSS file from separate light and dark schemes", () => {
  const light = parseTaintedYAML(`palette:\n  white: "#ffffff"\n  black: "#202020"\n  blue: "#0055aa"`);
  const dark = parseTaintedYAML(`palette:\n  black: "#101018"\n  white: "#eeeeff"\n  blue: "#88aaff"`);
  const css = generateThemeCSS({ light, dark });
  assert.match(css, /body\.theme-light[\s\S]*--bg: #202020/);
  assert.match(css, /body\.theme-dark[\s\S]*--bg: #101018/);
  assert.ok(css.includes("--code-normal: #eeeeff"));
});

test("uses light and dark UI keys from a single Tinted8 scheme", () => {
  const parsed = parseTaintedYAML(`ui:\n  chrome.background.light: "#ffffff"\n  chrome.background.dark: "#111111"\n  chrome.foreground.light: "#222222"\n  chrome.foreground.dark: "#eeeeee"`);
  const css = generateThemeCSS(parsed);
  assert.match(css, /body\.theme-light[\s\S]*--bg: #ffffff[\s\S]*--text: #222222/);
  assert.match(css, /body\.theme-dark[\s\S]*--bg: #111111[\s\S]*--text: #eeeeee/);
});

test("syntax token mapping uses distinct Base16 roles with exact colors", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "Syntax"
  system: "base16"
palette:
  base00: "#181818"
  base03: "#828282"
  base05: "#e8e8e8"
  base08: "#ff5555"
  base09: "#ff8800"
  base0A: "#ffd700"
  base0B: "#55aa55"
  base0D: "#5350b9"
  base0E: "#b94ac2"
`);
  const css = generateThemeCSS(parsed);
  // Conventional Base16 role mapping
  assert.ok(css.includes("--syntax-comment: #828282"), "comment should map to base03 gray");
  assert.ok(css.includes("--syntax-string: #55aa55"), "string should map to base0B green");
  assert.ok(css.includes("--syntax-number: #ff8800"), "number should map to base09 orange");
  assert.ok(css.includes("--syntax-keyword: #b94ac2"), "keyword should map to base0E magenta");
  assert.ok(css.includes("--syntax-function: #5350b9"), "function should map to base0D blue");
  assert.ok(css.includes("--syntax-type: #ffd700"), "type should map to base0A yellow");
  assert.ok(css.includes("--syntax-property: #ff5555"), "property should map to base08 red");
  assert.ok(css.includes("--syntax-operator: #b94ac2"), "operator should map to base0E magenta");
});

test("Base16 with yellow base03 emits neutral color-mix for muted and border", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "YellowBase"
  system: "base16"
palette:
  base00: "#1a1a1a"
  base03: "#ecba0f"
  base05: "#eeeeee"
  base0A: "#ffcc00"
`);
  const css = generateThemeCSS(parsed);
  // When no explicit semantic UI muted/border is given, it must NOT emit the yellow base03.
  assert.ok(!css.includes("--muted: #ecba0f"), "muted should not be yellow base03");
  assert.ok(!css.includes("--border: #ecba0f"), "border should not be yellow base03");
  assert.ok(!css.includes("--obs-muted: #ecba0f"), "obs-muted should not be yellow base03");
  assert.ok(!css.includes("--obs-border: #ecba0f"), "obs-border should not be yellow base03");
  // It should emit neutral color-mix derived from foreground/background instead.
  assert.ok(css.includes("color-mix"), "should use color-mix for muted/border");
  assert.ok(css.includes("--muted: color-mix"), "--muted should be a color-mix value");
  assert.ok(css.includes("--border: color-mix"), "--border should be a color-mix value");
});

test("explicit semantic UI muted/border values are preserved", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "ExplicitUI"
  system: "tinted8"
ui:
  chrome.background.dark: "#0a0a0a"
  chrome.foreground.dark: "#f0f0f0"
  foreground.dim.dark: "#777777"
  chrome.border.dark: "#333333"
`);
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--muted: #777777"), "explicit muted should be preserved");
  assert.ok(css.includes("--border: #333333"), "explicit border should be preserved");
  assert.ok(css.includes("--obs-muted: #777777"), "explicit obs-muted should be preserved");
  assert.ok(css.includes("--obs-border: #333333"), "explicit obs-border should be preserved");
  // Should NOT fall back to color-mix when explicitly provided.
  assert.ok(!css.includes("--muted: color-mix"), "explicit muted should not become color-mix");
  assert.ok(!css.includes("--border: color-mix"), "explicit border should not become color-mix");
});

test("syntax comment can still use base03 from palette", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "CommentTest"
  system: "base16"
palette:
  base00: "#111111"
  base03: "#ecba0f"
  base05: "#eeeeee"
`);
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--syntax-comment: #ecba0f"), "syntax comment should use base03 color");
});

test("sanitizeSchemeId prevents traversal", () => {
  assert.equal(sanitizeSchemeId("tinted8-nord"), "tinted8-nord");
  assert.equal(sanitizeSchemeId("bad/name"), "bad-name");
  assert.equal(sanitizeSchemeId("../secret"), "---secret");
});

test("parses and preserves Base24 base10-base17 palette colors", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "Base24"
  system: "base24"
palette:
  base00: "#181818"
  base10: "#ff5555"
  base11: "#ffaa55"
  base12: "#ffdd55"
  base13: "#55ff55"
  base14: "#55ffff"
  base15: "#5555ff"
  base16: "#aa55ff"
  base17: "#ff55ff"
`);
  assert.equal(parsed.system, "base24");
  assert.equal(parsed.palette?.base10, "#ff5555");
  assert.equal(parsed.palette?.base12, "#ffdd55");
  assert.equal(parsed.palette?.base17, "#ff55ff");
});

test("exact Tinted8 syntax precedence over palette", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "SyntaxPrecedence"
  system: "tinted8"
syntax:
  comment: "#777777"
  string: "#22863a"
  constant.numeric: "#d97706"
  keyword: "#6f42c1"
  entity.name.function: "#005cc5"
  entity.name.type: "#b8860b"
  variable: "#d73a49"
  keyword.operator: "#6f42c1"
  punctuation: "#e6eaf0"
palette:
  black: "#000000"
  white: "#ffffff"
`);
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--syntax-comment: #777777"), "authored comment syntax should win");
  assert.ok(css.includes("--syntax-string: #22863a"), "authored string syntax should win");
  assert.ok(css.includes("--syntax-number: #d97706"), "authored numeric syntax should win");
  assert.ok(css.includes("--syntax-keyword: #6f42c1"), "authored keyword syntax should win");
  assert.ok(css.includes("--syntax-function: #005cc5"), "authored function syntax should win");
  assert.ok(css.includes("--syntax-type: #b8860b"), "authored type syntax should win");
  assert.ok(css.includes("--syntax-property: #d73a49"), "authored property/variable syntax should win");
  assert.ok(css.includes("--syntax-operator: #6f42c1"), "authored operator syntax should win");
  assert.ok(css.includes("--syntax-punctuation: #e6eaf0"), "authored punctuation syntax should win");
});

test("Base24 prefers bright counterparts for syntax roles", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "Base24Bright"
  system: "base24"
palette:
  base00: "#181818"
  base03: "#828282"
  base08: "#ff5555"
  base09: "#ff8800"
  base0A: "#ffd700"
  base0B: "#55aa55"
  base0D: "#5350b9"
  base0E: "#b94ac2"
  base12: "#ff7777"
  base13: "#ffff77"
  base14: "#77ff77"
  base16: "#7777ff"
  base17: "#ff77ff"
`);
  const css = generateThemeCSS(parsed);
  // Bright counterparts should be preferred over standard colors
  assert.ok(css.includes("--syntax-property: #ff7777"), "property should prefer bright base12");
  assert.ok(css.includes("--syntax-type: #ffff77"), "type should prefer bright base13");
  assert.ok(css.includes("--syntax-string: #77ff77"), "string should prefer bright base14");
  assert.ok(css.includes("--syntax-function: #7777ff"), "function should prefer bright base16");
  assert.ok(css.includes("--syntax-keyword: #ff77ff"), "keyword should prefer bright base17");
  assert.ok(css.includes("--syntax-operator: #ff77ff"), "operator should prefer bright base17");
  // Number and comment keep standard roles/fallbacks (no bright counterparts for number/comment)
  assert.ok(css.includes("--syntax-number: #ff8800"), "number should keep standard base09");
  assert.ok(css.includes("--syntax-comment: #828282"), "comment should keep standard base03");
});

test("Base24 bright-token fallback to standard when bright missing", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "Base24Fallback"
  system: "base24"
palette:
  base00: "#181818"
  base08: "#ff5555"
  base0D: "#5350b9"
  base0E: "#b94ac2"
`);
  const css = generateThemeCSS(parsed);
  // Function uses standard blue because bright base16 is missing
  assert.ok(css.includes("--syntax-function: #5350b9"), "function should fall back to base0D when bright base16 missing");
  assert.ok(css.includes("--syntax-keyword: #b94ac2"), "keyword should fall back to base0E when bright base17 missing");
  assert.ok(css.includes("--syntax-operator: #b94ac2"), "operator should fall back to base0E when bright base17 missing");
  // Property uses standard red when bright base12 missing
  assert.ok(css.includes("--syntax-property: #ff5555"), "property should fall back to base08 when bright base12 missing");
});

test("parses official Base16 metadata and inline palette comments", () => {
  const parsed = parseTaintedYAML(`system: "base16"
name: "Catppuccin Latte"
variant: "light"
palette:
  base00: "#eff1f5" # base
  base05: "#4c4f69" # text
  base07: "#7287fd" # lavender
  base0B: "#40a02b" # green
`);
  assert.equal(parsed.system, "base16");
  assert.equal(parsed.name, "Catppuccin Latte");
  assert.equal(parsed.variant, "light");
  assert.equal(parsed.palette?.black, "#eff1f5");
  assert.equal(parsed.palette?.white, "#4c4f69");
  assert.equal(parsed.palette?.white_brightest, "#7287fd");
  assert.equal(parsed.palette?.green, "#40a02b");
  const css = generateThemeCSS(parsed);
  assert.match(css, /body\.theme-light[\s\S]*--bg: #eff1f5[\s\S]*--text: #4c4f69/);
  assert.ok(css.includes("--syntax-string: #40a02b"));
});

test("parses official Base24 metadata, bright colors, and inline comments", () => {
  const parsed = parseTaintedYAML(`system: "base24"
name: "Catppuccin Latte"
variant: "light"
palette:
  base00: "#eff1f5" # base
  base05: "#4c4f69" # text
  base0B: "#40a02b" # green
  base14: "#40a02b" # bright green
  base16: "#209fb5" # bright blue
`);
  assert.equal(parsed.system, "base24");
  assert.equal(parsed.palette?.base14, "#40a02b");
  assert.equal(parsed.palette?.base16, "#209fb5");
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--syntax-string: #40a02b"));
  assert.ok(css.includes("--syntax-function: #209fb5"));
});

test("parses official Tinted8 inline comments and syntax scopes", () => {
  const parsed = parseTaintedYAML(`scheme:
  system: "tinted8"
  supports:
    styling-spec: "0.2.0"
  name: "Catppuccin Latte"
variant: "light"
palette:
  black: "#4c4f69" # crust
  white: "#dce0e8" # text
  green: "#40a02b" # green
  blue: "#1e66f5" # blue
syntax:
  meta.function: "#1e66f5"
  punctuation.brackets.angle: "#179299"
  punctuation.brackets: "#e64553" # maroon
`);
  assert.equal(parsed.system, "tinted8");
  assert.equal(parsed.name, "Catppuccin Latte");
  assert.equal(parsed.variant, "light");
  assert.equal(parsed.palette?.black, "#4c4f69");
  assert.equal(parsed.palette?.green, "#40a02b");
  assert.equal(parsed.syntax?.["punctuation.brackets"], "#e64553");
  const css = generateThemeCSS(parsed);
  assert.match(css, /body\.theme-light[\s\S]*--bg: #dce0e8[\s\S]*--text: #4c4f69/);
  assert.ok(css.includes("--syntax-string: #40a02b"));
  assert.ok(css.includes("--syntax-function: #1e66f5"));
  assert.ok(css.includes("--syntax-punctuation: #e64553"));
});

test("Base16 top-level metadata and inline comments are stripped correctly", () => {
  const yaml = `system: "base16"
name: "Catppuccin Latte"
author: "catppuccin"
variant: "light"
base00: "#eff1f5" # base
base05: "#4c4f69" # text
base08: "#d20f39" # red
base0B: "#40a02b" # green
base0D: "#8839ef" # blue
`;
  const parsed = parseTaintedYAML(yaml);
  assert.equal(parsed.system, "base16");
  assert.equal(parsed.name, "Catppuccin Latte");
  assert.equal(parsed.variant, "light");
  assert.equal(parsed.palette?.black, "#eff1f5"); // legacy mapping base00 -> black
  assert.equal(parsed.palette?.white, "#4c4f69"); // base05 -> white (legacy mapping)
  assert.equal(parsed.palette?.red, "#d20f39");
  assert.equal(parsed.palette?.green, "#40a02b");
  assert.equal(parsed.palette?.blue, "#8839ef");
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--bg: #eff1f5"), "Base16 palette color preserved after stripping inline comment");
  assert.ok(css.includes("body.theme-light"), "Base16 generates CSS modes");
});

test("Base24 top-level metadata and inline comments are stripped correctly", () => {
  const yaml = `system: "base24"
name: "Catppuccin Latte"
variant: "dark"
base00: "#eff1f5" # base
base05: "#4c4f69" # text
base08: "#d20f39" # red
base09: "#df8e1d" # yellow
base0B: "#40a02b" # green
base0C: "#179299" # cyan
base0D: "#8839ef" # blue
base0E: "#aa4a96" # magenta
base10: "#dc8a78" # bright red
base11: "#eebd89" # bright yellow
base12: "#907aa9" # bright magenta-ish
base13: "#89dceb" # bright cyan
base14: "#a6e3a1" # bright green
base15: "#cba6f7" # bright blue
base16: "#89b4fa" # bright blue (alternate)
base17: "#f38ba8" # bright red (alternate)
`;
  const parsed = parseTaintedYAML(yaml);
  assert.equal(parsed.system, "base24");
  assert.equal(parsed.name, "Catppuccin Latte");
  assert.equal(parsed.variant, "dark");
  assert.equal(parsed.palette?.base10, "#dc8a78");
  assert.equal(parsed.palette?.base17, "#f38ba8");
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--syntax-function: #89b4fa"), "Base24 bright base16 preferred for function");
  assert.ok(css.includes("--syntax-keyword: #f38ba8"), "Base24 bright base17 preferred for keyword");
  assert.ok(css.includes("--syntax-string: #a6e3a1"), "Base24 bright base14 preferred for string");
  assert.ok(css.includes("--syntax-property: #907aa9"), "Base24 bright base12 preferred for property");
});

test("Tinted8 nested scheme with inline comments and syntax mapping", () => {
  const yaml = `scheme:
  system: "tinted8"
  name: "Catppuccin Latte"
  variant: "light"
palette:
  black: "#4c4f69" # crust
  white: "#eff1f5" # base
  blue: "#8839ef" # lavender
  green: "#40a02b" # green
syntax:
  meta.function: "#1e66f5"
  comment: "#6c6f85"
  string: "#40a02b"
  keyword: "#8839ef"
  punctuation.brackets: "#6c6f85"
  punctuation.brackets.angle: "#d20f39"
  punctuation: "#e6eaf0"
  function: "#005cc5"
`;
  const parsed = parseTaintedYAML(yaml);
  assert.equal(parsed.system, "tinted8");
  assert.equal(parsed.name, "Catppuccin Latte");
  assert.equal(parsed.palette?.black, "#4c4f69");
  assert.equal(parsed.syntax?.["meta.function"], "#1e66f5");
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--syntax-function: #1e66f5"), "meta.function mapped to function and preferred over generic function");
  assert.ok(css.includes("--syntax-punctuation: #6c6f85"), "punctuation.brackets preferred over generic punctuation");
  assert.ok(css.includes("body.theme-light"), "Tinted8 generates CSS modes");
});

test("unquoted hex palette colors with leading hash are preserved (no false comment stripping)", () => {
  const yaml = `scheme:
  name: "UnquotedHex"
  system: "base16"
palette:
  black: #181818
  white: #eeeeee
`;
  const parsed = parseTaintedYAML(yaml);
  assert.equal(parsed.palette?.black, "#181818");
  assert.equal(parsed.palette?.white, "#eeeeee");
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--bg: #181818"), "unquoted hex value preserved");
});
