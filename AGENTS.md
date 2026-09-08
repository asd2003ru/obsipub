# Repository Guidelines

## Project Structure & Module Organization

ObsiPub is a Go/Fiber publication server with two frontend parts:

- `cmd/obsipub/` contains the executable entry point.
- `internal/` contains server, configuration, file discovery, graph/grab, and archive publication packages. Tests live beside packages as `*_test.go`.
- `plugin/` is the TypeScript Obsidian plugin; source is in `plugin/src/`, tests in `plugin/tests/`, and build output in `plugin/dist/`.
- `web/` is the Vite web UI; source is in `web/src/`, static files in `web/public/`, and generated output in `web/dist/`.
- `testvault/` is a fixture vault for plugin deployment and manual testing. `notes/` is publication data, not source.

## Build, Test, and Development Commands

Run the server with `go run ./cmd/obsipub --api-key 'secret'`. The default port is `8088`; see `README.md` for flags and environment variables.

- `go test ./...` runs all Go unit tests.
- `cd plugin && npm install` installs dependencies.
- `cd plugin && npm test` runs TypeScript archive tests.
- `cd plugin && npm run build` builds the plugin; `npm run deploy` copies it into `testvault/.obsidian/plugins/obsipub/`.
- `cd web && npm install && npm run build` builds the web UI.
- `make all` builds plugin, web UI, and Go service into `distrib/`; `make clean` removes generated output.

## Coding Style & Naming Conventions

Use `gofmt` for Go and keep tests adjacent to implementation. Follow existing TypeScript/JavaScript formatting and ES modules; use camelCase identifiers and PascalCase Vue components. Keep paths vault-relative and validate archive input at boundaries. Do not commit `node_modules/`, `dist/`, local configuration, or secrets.

## Testing Guidelines

Add Go tests for behavior in the relevant `internal/<package>/` directory, named `Test<Behavior>`. Add plugin tests under `plugin/tests/` with the Node test runner. Run `go test ./...`, `cd plugin && npm test`, and the web build before submitting; no coverage threshold is configured.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so no established commit format could be verified. Use short, imperative subject lines (for example, `Validate publication archive paths`) and keep unrelated changes separate. Pull requests should explain behavior changes, list validation commands, link an issue when applicable, and include screenshots or a short recording for web/plugin UI changes.

## Security & Configuration Tips

Treat `OBSIPUB_API_KEY` and plugin API-key settings as secrets. Test with a non-production vault, never point `--root` inside the source vault, and preserve the archive validation guarantees for traversal, symlink, duplicate-path, and size-limit checks.

## Two-Agent Workflow

For implementation tasks, use the `opencode-orchestrator` skill and delegate the focused implementation to OpenCode. Codex remains the architect and final reviewer: inspect the repository and plan, decompose the smallest coherent task, define the allowed file scope and acceptance criteria, review the resulting diff, and run final validation.

- Use OpenCode only for bounded implementation and focused tests.
- Do not pass `--model`; use the model configured in OpenCode.
- OpenCode must not commit, reset, force-push, delete unrelated files, or modify files outside the assigned scope.
- Codex must inspect `git diff`/`git status`, correct issues when needed, and run the required tests before reporting completion.
