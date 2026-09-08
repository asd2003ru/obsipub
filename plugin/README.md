# Obsipub Publisher

An Obsidian plugin that publishes the active Markdown note to an obsipub server.

## Build and deploy

```bash
cd plugin
npm install
npm run deploy
```

`deploy` builds `dist/` with TypeScript/esbuild and copies `main.js`, `manifest.json`, and `styles.css` to `../testvault/.obsidian/plugins/obsipub/`.

## Use

1. Enable **Obsipub Publisher** in Obsidian Community Plugins.
2. Set the server URL and API key in the plugin settings.
3. Use the ribbon upload icon or **Publish active note** command.

The plugin recursively resolves Obsidian metadata-cache links and embeds, packages Markdown, attachments, and linked `.excalidraw` / `.excalidraw.md` files at vault-relative paths, then includes the selected custom theme from `.obsidian/themes/<cssTheme>`. It writes the exact server manifest `{ version: 1, index, theme, showLineNumbers, tree }`: `theme` is the published CSS path or `""`, and `tree` is rooted at the selected note and contains outgoing Markdown-note dependencies only (assets and theme files are omitted). The web interface chooses Russian only when the browser language is `ru` (including regional variants); all other browser languages use English. The browser-compatible ZIP is posted raw to `<server-url>/api/publish` with `X-API-Key`.

Run `npm test` for archive/index unit tests.

The publish dialog shows a live publication URL preview and provides two copy buttons: one copies the public URL, and one copies the quick-auth URL with a URL-encoded `pwd` query parameter. The quick-auth button is disabled when the password field is empty.
