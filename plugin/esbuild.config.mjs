import esbuild from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const dist = resolve(root, "dist");
const deployDir = resolve(root, "../testvault/.obsidian/plugins/obsipub");

await esbuild.build({
  entryPoints: [resolve(root, "src/main.ts")],
  bundle: true,
  outfile: resolve(dist, "main.js"),
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["obsidian"],
  sourcemap: "inline",
  logLevel: "info"
});
await cp(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
await cp(resolve(root, "styles.css"), resolve(dist, "styles.css"));

if (process.argv.includes("--deploy")) {
  // Do not replace the whole plugin directory: Obsidian keeps the user's
  // server URL and API key in data.json beside the release artifacts.
  await mkdir(deployDir, { recursive: true });
  await cp(dist, deployDir, { recursive: true, force: true });
  console.log(`Deployed plugin to ${deployDir} (settings preserved)`);
}
