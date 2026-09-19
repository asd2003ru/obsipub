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

test("sanitizeSchemeId prevents traversal", () => {
  assert.equal(sanitizeSchemeId("tinted8-nord"), "tinted8-nord");
  assert.equal(sanitizeSchemeId("bad/name"), "bad-name");
  assert.equal(sanitizeSchemeId("../secret"), "---secret");
});
