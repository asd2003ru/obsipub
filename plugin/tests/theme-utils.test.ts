import assert from "node:assert/strict";
import test from "node:test";
import { hasExternalThemeResources, isCustomThemeFileName, isSafeThemeDirectoryName } from "../src/theme-utils";
import { sanitizeSchemeId } from "../src/theme-converter";

test("custom theme names stay inside the theme directory", () => {
  assert.equal(isCustomThemeFileName("my theme.css"), true);
  assert.equal(isCustomThemeFileName("тема.CSS"), true);
  for (const name of ["../escape.css", "folder/theme.css", "folder\\theme.css", "theme.txt", "bad\n.css"]) {
    assert.equal(isCustomThemeFileName(name), false, name);
  }
});

test("custom theme CSS allows bundled relative assets and rejects external resources", () => {
  assert.equal(hasExternalThemeResources("body { color: red }"), false);
  assert.equal(hasExternalThemeResources("@import 'other.css';"), true);
  assert.equal(hasExternalThemeResources("body { background: url(image.png) }"), false);
  assert.equal(hasExternalThemeResources("body { src: url(fonts/text.woff2) }"), false);
  assert.equal(hasExternalThemeResources("body { background: url(https://example.com/x.png) }"), true);
  assert.equal(hasExternalThemeResources("body { background: url(//example.com/x.png) }"), true);
  assert.equal(hasExternalThemeResources("body { src: url(data:font/woff;base64,abc) }"), true);
});

test("theme directory names are safe", () => {
  assert.equal(isSafeThemeDirectoryName("my-theme"), true);
  assert.equal(isSafeThemeDirectoryName("tinted8_nord"), true);
  assert.equal(isSafeThemeDirectoryName("../escape"), false);
  assert.equal(isSafeThemeDirectoryName("folder/theme"), false);
  assert.equal(isSafeThemeDirectoryName(""), false);
});

test("scheme IDs are sanitized", () => {
  assert.equal(sanitizeSchemeId("tinted8-nord"), "tinted8-nord");
  assert.equal(sanitizeSchemeId("base16-default"), "base16-default");
  assert.equal(sanitizeSchemeId("bad/name!"), "bad-name-");
});
