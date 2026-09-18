import assert from "node:assert/strict";
import test from "node:test";
import { hasExternalThemeResources, isCustomThemeFileName } from "../src/theme-utils";

test("custom theme names stay inside the theme directory", () => {
  assert.equal(isCustomThemeFileName("my theme.css"), true);
  assert.equal(isCustomThemeFileName("тема.CSS"), true);
  for (const name of ["../escape.css", "folder/theme.css", "folder\\theme.css", "theme.txt", "bad\n.css"]) {
    assert.equal(isCustomThemeFileName(name), false, name);
  }
});

test("custom theme CSS is self-contained", () => {
  assert.equal(hasExternalThemeResources("body { color: red }"), false);
  assert.equal(hasExternalThemeResources("@import 'other.css';"), true);
  assert.equal(hasExternalThemeResources("body { background: url(image.png) }"), true);
  assert.equal(hasExternalThemeResources("body { src: url(data:font/woff;base64,abc) }"), false);
  assert.equal(hasExternalThemeResources("body { src: url('data:font/woff;base64,abc') }"), false);
});
