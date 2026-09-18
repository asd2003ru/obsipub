import assert from "node:assert/strict";
import test from "node:test";
import { convert, inlineCssUrls, inlineLocalImports, isSimpleColor, safeBasename } from "../src/theme-converter";

test("maps literal color variables from body.theme-light/theme-dark", () => {
  const css = `body.theme-light {
    --background-primary: #f5f7fa;
    --text-normal: #1a2332;
  }
  body.theme-dark {
    --background-primary: #0f1322;
    --text-normal: #e6eaf0;
  }`;
  const result = convert(css);
  assert.ok(result.css.includes("body.theme-light {"));
  assert.ok(result.css.includes("--bg: #f5f7fa;"));
  assert.ok(result.css.includes("--obs-canvas: #f5f7fa;"));
  assert.ok(result.css.includes("--text: #1a2332;"));
  assert.ok(result.css.includes("--obs-text: #e6eaf0;"));
  assert.equal(result.warnings.length, 0);
});

test("handles .theme-light and .theme-dark selectors", () => {
  const css = `.theme-light { --interactive-accent: #2a5ca8; }
.theme-dark { --interactive-accent: #6b8cce; }`;
  const result = convert(css);
  assert.ok(result.css.includes("--accent: #2a5ca8;"));
  assert.ok(result.css.includes("--accent: #6b8cce;"));
});

test("uses generic body variables for both modes", () => {
  const result = convert("body { --background-primary: #fff; --interactive-accent: #245aaa; }");
  assert.ok(result.css.includes("body.theme-light"));
  assert.ok(result.css.includes("body.theme-dark"));
  assert.equal(result.warnings.length, 0);
});

test("handles comma selectors and Obsidian HSL tokens", () => {
  const result = convert(`.theme-light, .theme-light:not(.css-settings-manager) {
    --background-primary-hsl: 0, 0%, 100%;
  }
  .theme-dark, .theme-dark:not(.css-settings-manager) {
    --background-primary-hsl: 225, 50%, 20%;
  }`);
  assert.ok(result.css.includes("--bg: hsl(0, 0%, 100%);"));
  assert.ok(result.css.includes("--bg: hsl(225, 50%, 20%);"));
});

test("allows resolved imports and rejects remaining url() assets", async () => {
  const imported = await inlineLocalImports(
    "@import 'colors.css'; body.theme-light { --background-primary: #fff; }",
    "Prism/theme.css",
    async (path) => path === "Prism/colors.css" ? "body.theme-dark { --text-normal: #000; }" : ""
  );
  const result = convert(imported.css);
  assert.ok(result.css.includes("--text: #000;"));
  assert.throws(() => convert("body { background: url(image.png); }"), /self-contained/);
});

test("inlines CSS resources as data URLs", async () => {
  const result = await inlineCssUrls("body { background: url('icon.svg'); mask: url(data:image/svg+xml;base64,abc); }", async (url) => {
    assert.equal(url, "icon.svg");
    return "data:image/svg+xml;base64,xyz";
  });
  assert.match(result.css, /url\(data:image\/svg\+xml;base64,xyz\)/);
  assert.match(result.css, /url\(data:image\/svg\+xml;base64,abc\)/);
});

test("ignores var() and arbitrary selectors with warnings", () => {
  const css = `body.theme-light { --background-primary: var(--x); }
body.theme-dark { --text-normal: #000; }
.something { --interactive-accent: #fff; }`;
  const result = convert(css);
  assert.ok(result.warnings.some((w) => w.includes("Skipped non-literal color")));
  assert.ok(result.warnings.some((w) => w.includes("Skipped selector")));
  assert.ok(result.css.includes("--text: #000;"));
});

test("handles missing mode with warning", () => {
  const css = `body.theme-light { --background-primary: #fff; }`;
  const result = convert(css);
  assert.ok(result.warnings.some((w) => w.includes("No supported literal colors found for dark mode")));
  assert.ok(result.css.includes("body.theme-light {"));
});

test("warns when no supported colors are found", () => {
  const result = convert("body.theme-light {}")
  assert.ok(result.warnings.some((w) => w.includes("No supported literal colors")));
});

test("safeBasename strips unsafe chars and prevents traversal", () => {
  assert.equal(safeBasename("my-theme.css"), "my-theme.css");
  assert.equal(safeBasename("../escape.css"), "escape.css");
  assert.equal(safeBasename("folder/theme.css"), "theme.css");
  assert.equal(safeBasename("bad\nname.css"), "bad-name.css");
  assert.equal(safeBasename(""), "theme.css");
  assert.equal(safeBasename(".hidden.css"), ".hidden.css");
});

test("isSimpleColor recognizes literal colors", () => {
  assert.ok(isSimpleColor("#fff"));
  assert.ok(isSimpleColor("#ffffff"));
  assert.ok(isSimpleColor("rgb(0,0,0)"));
  assert.ok(isSimpleColor("rgba(0,0,0,0.5)"));
  assert.ok(isSimpleColor("hsl(0,0%,0%)"));
  assert.ok(isSimpleColor("transparent"));
  assert.ok(isSimpleColor("black"));
  assert.equal(isSimpleColor("red"), false);
  assert.equal(isSimpleColor("var(--x)"), false);
});
