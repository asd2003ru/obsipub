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

test("emits syntax token variables derived from palette", () => {
  const parsed = parseTaintedYAML(`scheme:
  name: "Syntax"
  system: "tinted8"
palette:
  black: "#000000"
  white: "#ffffff"
  blue: "#0055aa"
  red: "#cc0000"
  green: "#22863a"
  gray: "#6a737d"
  magenta: "#6f42c1"
`);
  const css = generateThemeCSS(parsed);
  assert.ok(css.includes("--syntax-keyword:"));
  assert.ok(css.includes("--syntax-string:"));
  assert.ok(css.includes("--syntax-number:"));
  assert.ok(css.includes("--syntax-comment:"));
  assert.ok(css.includes("--syntax-function:"));
  assert.ok(css.includes("--syntax-type:"));
  assert.ok(css.includes("--syntax-property:"));
  assert.ok(css.includes("--syntax-operator:"));
  assert.ok(css.includes("--syntax-punctuation:"));
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
