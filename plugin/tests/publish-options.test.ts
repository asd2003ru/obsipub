import assert from "node:assert/strict";
import test from "node:test";
import { currentObsidianTheme, isFutureExpiry, normalizeTheme, parsePublicationResponse } from "../src/publish-options";
import { rewriteFrontmatterWithObsipub } from "../src/archive";

test("parsePublicationResponse validates expiresAt as Unix seconds or null", () => {
  assert.deepEqual(parsePublicationResponse({ prefix: "x", expiresAt: 12345 }), { prefix: "x", expiresAt: 12345 });
  assert.deepEqual(parsePublicationResponse({ prefix: "x", expiresAt: 0 }), { prefix: "x", expiresAt: null });
  assert.deepEqual(parsePublicationResponse({ prefix: "x", expiresAt: null }), { prefix: "x", expiresAt: null });
  assert.deepEqual(parsePublicationResponse({ prefix: "x" }), { prefix: "x", expiresAt: null });
});

test("parsePublicationResponse rejects unsafe prefix with expiry present", () => {
  assert.throws(() => parsePublicationResponse({ prefix: "bad/one", expiresAt: 100 }), /invalid publication prefix/);
});

test("isFutureExpiry rejects current and past timestamps", () => {
  assert.equal(isFutureExpiry("2026-01-01T00:00:00.000Z", Date.parse("2026-01-01T00:00:00.000Z")), false);
  assert.equal(isFutureExpiry("2025-12-31T23:59:59.000Z", Date.parse("2026-01-01T00:00:00.000Z")), false);
  assert.equal(isFutureExpiry("2026-01-01T00:00:01.000Z", Date.parse("2026-01-01T00:00:00.000Z")), true);
});

test("normalizeTheme falls back to auto", () => {
  assert.equal(normalizeTheme("light"), "light");
  assert.equal(normalizeTheme("dark"), "dark");
  assert.equal(normalizeTheme("unknown"), "auto");
});

test("currentObsidianTheme falls back to auto outside Obsidian", () => {
  assert.equal(currentObsidianTheme(), "auto");
});

test("rewriteFrontmatterWithObsipub writes flat YAML properties, not inline JSON", () => {
  const input = `---\ntitle: Example\nobsipub: {"url":"http://localhost:8088/","prefix":"","expire":null,"showLineNumbers":true,"showArticleLineNumbers":false,"protected":false}\ntags:\n  - docs\n---\n# Body\n`;
  const output = rewriteFrontmatterWithObsipub(input, {
    url: "http://localhost:8088/",
    prefix: "",
    expire: null,
    showLineNumbers: true,
    showArticleLineNumbers: false,
    protected: false
  });

  assert.match(output, /obsipub_url: http:\/\/localhost:8088\/\nobsipub_prefix: ""\nobsipub_expire: null\nobsipub_showLineNumbers: true\nobsipub_showArticleLineNumbers: false\nobsipub_protected: false/);
  assert.doesNotMatch(output, /obsipub:\s*\{/);
  assert.match(output, /tags:\n  - docs/);
  assert.match(output, /---\n# Body/);
});

test("rewriteFrontmatterWithObsipub includes fullWidth when true", () => {
  const input = "---\ntitle: Note\n---\n# Body\n";
  const output = rewriteFrontmatterWithObsipub(input, {
    url: "https://example.com/",
    prefix: "test",
    expire: null,
    showLineNumbers: false,
    showArticleLineNumbers: false,
    fullWidth: true,
    protected: false
  });
  assert.ok(output.includes("obsipub_fullWidth: true"));
});
