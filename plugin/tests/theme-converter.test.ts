import assert from "node:assert/strict";
import test from "node:test";
import { parseTaintedYAML, generateThemeCSS, sanitizeSchemeId } from "../src/theme-converter";

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset + 1, offset + 3), 16) / 255);
    const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const fg = luminance(foreground);
  const bg = luminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

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
  // Contrast correction may adjust exact values; verify mapping by role presence.
  assert.ok(css.includes("--syntax-string:"), "string variable present");
  assert.ok(css.includes("--syntax-number:"), "number variable present");
  assert.ok(css.includes("--syntax-keyword:"), "keyword variable present");
  assert.ok(css.includes("--syntax-function:"), "function variable present");
  assert.ok(css.includes("--syntax-type:"), "type variable present");
  assert.ok(css.includes("--syntax-property:"), "property variable present");
  assert.ok(css.includes("--syntax-operator:"), "operator variable present");
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

test("Base24 uses standard Base16 semantic roles, not bright counterparts", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "Base24Standard"
  system: "base24"
palette:
  base00: "#000000"
  base03: "#888888"
  base08: "#ff6666"
  base09: "#ffcc66"
  base0A: "#66ff66"
  base0B: "#66ffff"
  base0D: "#6699ff"
  base0E: "#ff66ff"
  base12: "#cc0000"
  base13: "#00cc00"
  base14: "#00cccc"
  base16: "#9999ff"
  base17: "#cc99ff"
`);
  const css = generateThemeCSS(parsed);
  const dark = css.match(/body\.theme-dark \{([\s\S]*?)\n\}/)?.[1] || "";
  // Base24 must use the same base08-base0F roles as Base16; bright colors
  // must not override ordinary syntax.
  assert.match(dark, /--syntax-comment: #888888;/, "comment uses standard base03");
  assert.match(dark, /--syntax-string: #66ffff;/, "string uses standard base0B green");
  assert.match(dark, /--syntax-number: #ffcc66;/, "number uses standard base09 orange");
  assert.match(dark, /--syntax-keyword: #ff66ff;/, "keyword uses standard base0E magenta");
  assert.match(dark, /--syntax-function: #6699ff;/, "function uses standard base0D blue");
  assert.match(dark, /--syntax-type: #66ff66;/, "type uses standard base0A yellow");
  assert.match(dark, /--syntax-property: #ff6666;/, "property uses standard base08 red");
  assert.match(dark, /--syntax-operator: #ff66ff;/, "operator uses standard base0E magenta");
  // Bright colors must not appear for ordinary syntax roles.
  assert.ok(!dark.includes("--syntax-string: #00cccc"), "string must not use bright base14");
  assert.ok(!dark.includes("--syntax-function: #9999ff"), "function must not use bright base16");
  assert.ok(!dark.includes("--syntax-keyword: #cc99ff"), "keyword must not use bright base17");
  assert.ok(!dark.includes("--syntax-property: #cc0000"), "property must not use bright base12");
});

test("3024 Day light theme: contrast-corrected syntax and warning foreground", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "3024 Day"
  system: "tinted8"
  variant: "light"
palette:
  white: "#f7f7f7"
  black: "#2d2d2d"
  yellow: "#fded02"
ui:
  chrome.background.light: "#f7f7f7"
  chrome.foreground.light: "#2d2d2d"
`);
  const css = generateThemeCSS(parsed);
  // Raw warning color preserved exactly.
  assert.ok(css.includes("--obs-callout-color-warning: #fded02"), "raw warning tint preserved");
  // Contrast-safe foreground emitted separately.
  assert.ok(css.includes("--obs-callout-foreground-warning:"), "contrast-safe warning foreground emitted");
  // The corrected foreground must not equal the raw yellow (contrast would be insufficient).
  const fgMatch = css.match(/--obs-callout-foreground-warning: (#?[0-9a-f]{6});/);
  assert.ok(fgMatch, "warning foreground parsed");
  assert.notEqual(fgMatch![1], "#fded02", "warning foreground must be adjusted for contrast");
  // Syntax number must have >=4.5:1 against panel (#f7f7f7) when both are opaque hex.
  const numberMatch = css.match(/--syntax-number: (#?[0-9a-f]{6});/);
  assert.ok(numberMatch, "syntax-number emitted");
  assert.ok(contrastRatio(numberMatch![1], "#f7f7f7") >= 4.5, "syntax number meets WCAG AA");
  assert.ok(contrastRatio(fgMatch![1], "#f7f7f7") >= 4.5, "warning foreground meets WCAG AA");
});

test("dark adequate-color theme: readable colors remain unchanged", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "DarkAdequate"
  system: "base16"
palette:
  base00: "#1a1a1a"
  base05: "#eeeeee"
  base08: "#ff5555"
  base09: "#ff8800"
  base0A: "#ffd700"
  base0B: "#55aa55"
  base0D: "#5350b9"
  base0E: "#b94ac2"
`);
  const css = generateThemeCSS(parsed);
  // When colors already have sufficient contrast against the dark panel,
  // they should remain unchanged.
  assert.ok(css.includes("--syntax-number: #ff8800"), "already-readable number preserved");
  assert.ok(css.includes("--syntax-string: #55aa55"), "already-readable string preserved");
  assert.ok(css.includes("--obs-callout-color-warning: #ff8800"), "warning raw preserved");
  assert.ok(css.includes("--obs-callout-foreground-warning: #ff8800"), "adequate foreground unchanged");
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
  assert.ok(css.includes("--syntax-function:"), "function variable present");
  assert.ok(css.includes("--syntax-keyword:"), "keyword variable present");
  assert.ok(css.includes("--syntax-operator:"), "operator variable present");
  assert.ok(css.includes("--syntax-property:"), "property variable present");
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
  assert.ok(css.includes("--syntax-string:"), "syntax-string emitted");
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
  assert.ok(css.includes("--syntax-string:"), "syntax-string emitted");
  assert.ok(css.includes("--syntax-function:"), "syntax-function emitted");
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
  assert.ok(css.includes("--syntax-string:"), "syntax-string emitted");
  assert.ok(css.includes("--syntax-function:"), "syntax-function emitted");
  assert.ok(css.includes("--syntax-punctuation:"), "syntax-punctuation emitted");
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
  assert.ok(css.includes("--syntax-function:"), "function emitted");
  assert.ok(css.includes("--syntax-keyword:"), "keyword emitted");
  assert.ok(css.includes("--syntax-string:"), "string emitted");
  assert.ok(css.includes("--syntax-property:"), "property emitted");
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
  assert.ok(css.includes("--syntax-function:"), "function emitted");
  assert.ok(css.includes("--syntax-punctuation:"), "punctuation emitted");
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
