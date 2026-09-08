import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import { createPublishZip, rewriteFrontmatterWithObsipub, sanitizeMarkdownFrontmatter } from "../src/archive";

test("createPublishZip writes the exact server index manifest contract", () => {
  const zip = createPublishZip([{ path: "notes/start.md", bytes: new TextEncoder().encode("# Start") }], {
    version: 1, index: "notes/start.md", theme: ".themes/Bolt/theme.css", showLineNumbers: true, showArticleLineNumbers: false,
    tree: { path: "notes/start.md", name: "start", children: [{ path: "notes/child.md", name: "child" }] }
  });
  const unpacked = unzipSync(zip);
  assert.equal(new TextDecoder().decode(unpacked["notes/start.md"]), "# Start");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(unpacked["index.json"])), {
    version: 1, index: "notes/start.md", theme: ".themes/Bolt/theme.css", showLineNumbers: true, showArticleLineNumbers: false,
    tree: { path: "notes/start.md", name: "start", children: [{ path: "notes/child.md", name: "child" }] }
  });
});

test("index manifest permits an empty theme CSS path", () => {
  const zip = createPublishZip([], { version: 1, index: "start.md", theme: "", showLineNumbers: false, showArticleLineNumbers: false, tree: { path: "start.md", name: "start" } });
  const manifest = JSON.parse(new TextDecoder().decode(unzipSync(zip)["index.json"]));
  assert.equal(manifest.theme, "");
  assert.equal(manifest.showArticleLineNumbers, false);
  assert.deepEqual(manifest.tree, { path: "start.md", name: "start" });
});

test("sanitizeMarkdownFrontmatter keeps title and list tags only", () => {
  const input = new TextEncoder().encode("---\ntitle: Public title\ntags:\n  - go\n  - docs\nobsipub:\n  password: secret\nprivate: hidden\n---\n# Body\n");
  assert.equal(new TextDecoder().decode(sanitizeMarkdownFrontmatter(input)), "---\ntitle: Public title\ntags:\n  - go\n  - docs\n---\n# Body\n");
});

test("sanitizeMarkdownFrontmatter removes frontmatter when no safe fields exist", () => {
  const input = new TextEncoder().encode("---\nprivate: hidden\n---\n# Body\n");
  assert.equal(new TextDecoder().decode(sanitizeMarkdownFrontmatter(input)), "# Body\n");
});

import { buildPublicationUploadHeaders, isValidPublicationPrefix, parsePublicationResponse, publicationURL, randomPublicationPrefix, quickAuthPublicationURL } from "../src/publish-options";

test("publication prefixes are validated as safe optional path segments", () => {
  assert.equal(isValidPublicationPrefix("my-publication_1"), true);
  assert.equal(isValidPublicationPrefix(""), true);
  assert.equal(isValidPublicationPrefix("nested/path"), false);
  assert.equal(isValidPublicationPrefix("a".repeat(65)), false);
});

test("random publication prefixes are valid and non-empty", () => {
  const prefix = randomPublicationPrefix();
  assert.equal(isValidPublicationPrefix(prefix), true);
  assert.match(prefix, /^pub-[a-z0-9]{10}$/);
});


test("upload headers preserve custom prefix and an empty password", () => {
  assert.deepEqual(buildPublicationUploadHeaders("api-key", { prefix: "custom_site", password: "" }), {
    "Content-Type": "application/zip",
    "X-API-Key": "api-key",
    "X-ObsiPub-Prefix": "custom_site",
    "X-ObsiPub-Password": ""
  });
});

test("upload response validation accepts a server prefix and rejects unsafe values", () => {
  assert.deepEqual(parsePublicationResponse({ ready: true, prefix: "custom_site" }), { prefix: "custom_site", expiresAt: null });
  assert.throws(() => parsePublicationResponse({ prefix: "nested/site" }), /invalid publication prefix/);
  assert.throws(() => parsePublicationResponse({}), /invalid publication/);
});

test("publication URL uses the configured server URL without a localhost default", () => {
  assert.equal(publicationURL("https://publish.example.test/base///", "custom_site"), "https://publish.example.test/base/custom_site");
});

test("upload headers allow an empty root prefix", () => {
  assert.deepEqual(buildPublicationUploadHeaders("api-key", { prefix: "", password: "" }), {
    "Content-Type": "application/zip",
    "X-API-Key": "api-key",
    "X-ObsiPub-Prefix": "",
    "X-ObsiPub-Password": ""
  });
});

test("upload response validation accepts an empty root prefix", () => {
  assert.deepEqual(parsePublicationResponse({ ready: true, prefix: "" }), { prefix: "", expiresAt: null });
});

test("publication URL preview excludes password and updates with prefix", () => {
  assert.equal(publicationURL("http://localhost:8088", "zzz"), "http://localhost:8088/zzz");
  assert.equal(publicationURL("http://localhost:8088/", "zzz"), "http://localhost:8088/zzz");
  assert.equal(publicationURL("https://example.com", "pub-test_1"), "https://example.com/pub-test_1");
  assert.equal(publicationURL("", "zzz"), "/zzz");
  assert.equal(publicationURL("http://localhost:8088/", ""), "http://localhost:8088/");
  assert.equal(publicationURL("http://localhost:8088", "nested/path"), "http://localhost:8088/nested/path");
  assert.ok(!publicationURL("http://localhost:8088", "zzz").includes("password"));
  assert.ok(!publicationURL("http://localhost:8088", "zzz").includes("pwd"));
});

test("upload headers include TTL when provided", () => {
  assert.deepEqual(buildPublicationUploadHeaders("api-key", { prefix: "x", password: "", ttl: "300" }), {
    "Content-Type": "application/zip",
    "X-API-Key": "api-key",
    "X-ObsiPub-Prefix": "x",
    "X-ObsiPub-Password": "",
    "X-ObsiPub-TTL": "300"
  });
});

test("upload headers include Expires-At when provided", () => {
  assert.deepEqual(buildPublicationUploadHeaders("api-key", { prefix: "x", password: "", expiresAt: "2026-09-08T12:00:00Z" }), {
    "Content-Type": "application/zip",
    "X-API-Key": "api-key",
    "X-ObsiPub-Prefix": "x",
    "X-ObsiPub-Password": "",
    "X-ObsiPub-Expires-At": "2026-09-08T12:00:00Z"
  });
});

test("plugin admin payload formats include clear expiry representation", () => {
  const clearPayload = { prefix: "pub-test", ttl: null, expiresAt: null };
  assert.equal(clearPayload.prefix, "pub-test");
  assert.equal((clearPayload as any).ttl, null);
  assert.equal((clearPayload as any).expiresAt, null);

  const ttlPayload = { prefix: "pub-test", ttl: "300", expiresAt: null };
  assert.equal(ttlPayload.ttl, "300");

  const untilPayload = { prefix: "pub-test", ttl: null, expiresAt: "2026-09-08T12:00:00Z" };
  assert.equal(untilPayload.expiresAt, "2026-09-08T12:00:00Z");
});

test("quick-auth URL includes properly URL-encoded pwd parameter and preserves root behavior", () => {
  assert.equal(quickAuthPublicationURL("http://localhost:8088", "", "secret"), "http://localhost:8088/?pwd=secret");
  assert.equal(quickAuthPublicationURL("http://localhost:8088/", "zzz", "my-pwd"), "http://localhost:8088/zzz?pwd=my-pwd");
  assert.equal(quickAuthPublicationURL("https://example.com", "pub-test_1", "p@ss/w=1"), "https://example.com/pub-test_1?pwd=p%40ss%2Fw%3D1");
  assert.equal(quickAuthPublicationURL("http://localhost:8088/", "", ""), "http://localhost:8088/?pwd=");
  assert.ok(quickAuthPublicationURL("http://localhost:8088", "zzz", "hello world").includes("pwd=hello%20world"));
});

test("rewriteFrontmatterWithObsipub writes Obsidian-compatible flat YAML and preserves unrelated fields", () => {
  const input = "---\ntitle: Note\ntags:\n  - tag1\nobsipub_url: old\n---\n# Body\n";
  const result = rewriteFrontmatterWithObsipub(input, {
    url: "https://example.com/pub",
    prefix: "test",
    expire: null,
    showLineNumbers: true,
    showArticleLineNumbers: false,
    protected: false
  });
  assert.ok(result.includes("obsipub_url: https://example.com/pub"));
  assert.ok(result.includes("obsipub_prefix: test"));
  assert.ok(result.includes("obsipub_expire: null"));
  assert.ok(result.includes("obsipub_showLineNumbers: true"));
  assert.ok(result.includes("obsipub_protected: false"));
  assert.ok(result.includes("title: Note"));
  assert.ok(result.includes("tags:\n  - tag1"));
  assert.ok(result.includes("# Body"));
});

test("rewriteFrontmatterWithObsipub removes existing nested obsipub block safely", () => {
  const input = "---\nobsipub:\n  url: old\n  prefix: old\nprivate: secret\n---\nContent\n";
  const result = rewriteFrontmatterWithObsipub(input, {
    url: "new",
    prefix: "new",
    expire: "2026-01-01T00:00:00Z",
    showLineNumbers: false,
    showArticleLineNumbers: true,
    protected: true
  });
  assert.ok(result.includes("obsipub_url: new"));
  assert.ok(result.includes("obsipub_prefix: new"));
  assert.ok(result.includes("private: secret"));
  assert.ok(!result.includes("  url: old"));
});
