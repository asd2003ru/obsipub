# ObsiPub

`obsipub` displays published Obsidian Markdown notes as a website. The Go/Fiber server serves the current publication; the Obsidian plugin creates and uploads it.

## Run the server

```bash
go run ./cmd/obsipub --api-key 'replace-with-a-secret'
```

On first start the server creates `notes/` and shows a waiting page until a note is published. Set the same publication key in the Obsidian plugin.

| Setting | Flag | Environment | Default |
| --- | --- | --- | --- |
| Published root | `--root`, `-r` | `OBSIPUB_ROOT` | `notes/` |
| Publication key | `--api-key` | `OBSIPUB_API_KEY` | empty (optional; uploads and admin disabled) |
| Host | `--host` | `OBSIPUB_HOST` | `localhost` |
| Port | `--port` | `OBSIPUB_PORT` | `8088` |
| Trusted proxies | `--trusted-proxy` | `OBSIPUB_TRUSTED_PROXIES` | empty (comma-separated IPs/CIDRs) |

The `--api-key` (`OBSIPUB_API_KEY`) is optional. If omitted, the server still starts, creates `notes/` if missing, preserves existing publications, and serves them; however uploads and administration are disabled. Configuring an API key is required for publishing.

### External web frontend

The frontend is served from `web/dist` (built with `npm run build` in the `web/` directory). The server reads the frontend directly from that external directory at runtime.

## Obsidian plugin

Install from this repo checkout into any vault with a single command:

```bash
VAULT="/path/to/vault" && npm ci --prefix plugin && npm run build --prefix plugin && mkdir -p "$VAULT/.obsidian/plugins/obsipub" && cp "plugin/dist/main.js" "plugin/dist/manifest.json" "plugin/dist/styles.css" "$VAULT/.obsidian/plugins/obsipub/"
```

Then enable the Community Plugin **ObsiPub Publisher** and configure the server URL and API key. Open a Markdown note and run **Publish active note**.

The plugin collects resolved internal notes, embeds, attachments, and Excalidraw files; preserves vault-relative folders; records the selected ObsiPub theme; writes `index.json`; then sends the ZIP to the server. Choose built-in **Classic** or **Contrast**, each with light/dark modes, or place a self-contained CSS file in `<vault>/.obsidian/obsipub/themes/` and select it in the publication dialog. Custom CSS may use `body.theme-light` and `body.theme-dark`; `url()` and `@import` are not supported. The dialog's preview is a style sample, not an exact page preview.

In the publish dialog you can set a URL prefix, password, and expiration. Use **Manage publications** to update expiration or remove a publication.

## Reverse-proxy configuration

When running behind a reverse proxy, pass `X-Forwarded-Proto: https` (or terminate TLS at the proxy) so cookies get `Secure`. Configure `--trusted-proxy` or `OBSIPUB_TRUSTED_PROXIES` with comma-separated IPs/CIDRs. The frontend builds URLs from the current path, so external hostnames and subpaths work without extra configuration beyond the proxy passing the correct `Host` and `X-Forwarded-Proto`.

`--trusted-proxy` and `OBSIPUB_TRUSTED_PROXIES` accept a comma-separated allowlist of proxy IP addresses or CIDR ranges, for example `10.0.0.10,10.0.0.0/24`. Set `CLOG_LEVEL=debug` for request details; passwords, API keys, and archive contents are never logged.

## Local test/manual workflow

```bash
make plugin-deploy         # build plugin and deploy to testvault
make back                  # start server in foreground (uses OBSIPUB_API_KEY / OBSIPUB_ROOT / OBSIPUB_PORT / OBSIPUB_HOST / OBSIPUB_TRUSTED_PROXIES)
make test                  # Go tests (configurable GOCACHE default /tmp/obsipub-go-cache), plugin npm tests, web build
make release               # build plugin, web UI, and Go binary into distrib/
make dev                   # build plugin, web frontend, and Go binary into distrib/; deploy plugin to testvault (.obsidian/plugins/obsipub/); then start the built server in the foreground serving the built web frontend (OBSIPUB_* variables preserved)
make clean                 # clean generated artifacts
```

Variables are configurable via environment or make args (`OBSIPUB_API_KEY=secret make back`).

## Build and container workflow

```bash
make back                # start backend in foreground (OBSIPUB_* variables)
make front               # build web UI
make plugin              # build plugin
make test                # Go tests + plugin tests + web build (GOCACHE configurable)
make release             # build plugin, web, and binary into distrib/
make dev                 # build plugin, web, and binary into distrib/; deploy plugin into testvault; start the built backend in foreground serving the built web frontend (OBSIPUB_* variables)
make clean               # remove distrib/, dist/
```

Variables are configurable via environment or make args (`OBSIPUB_API_KEY=secret GOCACHE=/tmp/obsipub-go-cache make test`).

### Docker

```bash
docker compose -f docker-compose.developer.yml up --build
```

Environment variables for compose:
- `OBSIPUB_PORT` (default `8088`) — host port mapped to container `8088`
- `OBSIPUB_API_KEY`
- `OBSIPUB_TRUSTED_PROXIES`
- `OBSIPUB_NOTES_DIR` (default `./notes`) — persisted notes directory

The container sets `OBSIPUB_HOST=0.0.0.0`, `OBSIPUB_ROOT=/data/notes`, and exposes `8088`.

To run the latest image published to GitHub Container Registry instead of building locally:

```bash
docker compose -f docker-compose.yml up -d
```

The GHCR package must be public, or Docker must already be authenticated to `ghcr.io`.

### GitHub releases

Pushing a tag matching `v*.*.*-release` (for example `v1.0.0-release`) starts the GitHub Actions release workflow. It runs the tests, creates a GitHub Release with archives for Linux x64, Linux ARM64, Windows x64, macOS x64, and macOS ARM64, and publishes the Docker image to GHCR as both the release tag and `latest`:

```bash
git tag v1.0.0-release
git push origin v1.0.0-release
```

The image is published as `ghcr.io/<owner>/<repository>:v1.0.0-release`.

## Development checks

```bash
go test ./...
(cd web && npm run build)
(cd plugin && npm test && npm run deploy)
# Or run everything via Make:
make test
```

---

# Русский

`obsipub` отображает опубликованные заметки Markdown из Obsidian как веб-сайт. Go/Fiber-сервер обслуживает текущую публикацию; плагин Obsidian создаёт и загружает её.

## Запуск сервера

```bash
go run ./cmd/obsipub --api-key 'replace-with-a-secret'
```

При первом запуске сервер создаёт `notes/` и показывает страницу ожидания до первой публикации. Укажите тот же ключ публикации в плагине Obsidian.

| Параметр | Флаг | Переменная среды | По умолчанию |
| --- | --- | --- | --- |
| Корень публикации | `--root`, `-r` | `OBSIPUB_ROOT` | `notes/` |
| Ключ публикации | `--api-key` | `OBSIPUB_API_KEY` | пусто (опционально; загрузки и админ отключены) |
| Хост | `--host` | `OBSIPUB_HOST` | `localhost` |
| Порт | `--port` | `OBSIPUB_PORT` | `8088` |

`--api-key` (`OBSIPUB_API_KEY`) является опциональным. Если он не указан, сервер всё равно запускается, создаёт `notes/`, если папка отсутствует, сохраняет существующие публикации и обслуживает их; однако загрузки и администрирование отключены. Для публикаций необходимо настроить API-ключ.

### Внешний веб-фронтенд

Фронтенд обслуживается из `web/dist` (собирается через `npm run build` в директории `web/`). Сервер читает фронтенд напрямую из этой внешней директории во время выполнения.

## Плагин Obsidian

Установка из этого репозитория в выбранный vault одной командой:

```bash
VAULT="/path/to/vault" && npm ci --prefix plugin && npm run build --prefix plugin && mkdir -p "$VAULT/.obsidian/plugins/obsipub" && cp "plugin/dist/main.js" "plugin/dist/manifest.json" "plugin/dist/styles.css" "$VAULT/.obsidian/plugins/obsipub/"
```

Затем включите плагин сообщества **ObsiPub Publisher** и настройте URL сервера и API-ключ. Откройте заметку Markdown и запустите **Publish active note**.

Плагин собирает разрешённые внутренние заметки, встраивания, вложения и файлы Excalidraw; сохраняет папки относительно vault; записывает `index.json`; затем отправляет ZIP на сервер. Выберите встроенную тему **Classic** или **Contrast**, каждая с режимами light/dark, или поместите собственный CSS-файл в `<vault>/.obsidian/obsipub/themes/` и выберите его в диалоге публикации. Пользовательские CSS могут использовать `body.theme-light` и `body.theme-dark`; `url()` и `@import` не поддерживаются. Предпросмотр в диалоге — это образец стиля, не точный предпросмотр страницы.

В диалоге публикации можно задать префикс URL, пароль и срок действия. Команда **Manage publications** позволяет изменить срок действия или удалить публикацию.

## Конфигурация обратного прокси

При работе за обратным прокси передайте `X-Forwarded-Proto: https` (или завершите TLS на прокси). Фронтенд формирует ссылки из текущего пути, поэтому внешние хосты и подпути работают без дополнительной настройки, кроме прокси, передающего правильные `Host` и `X-Forwarded-Proto`.

`--trusted-proxy` и `OBSIPUB_TRUSTED_PROXIES` принимают список IP-адресов прокси или CIDR через запятую, например `10.0.0.10,10.0.0.0/24`. Установите `CLOG_LEVEL=debug` для подробностей; пароли, API-ключи и содержимое архивов никогда не логируются.

## Локальный тестовый/ручной рабочий процесс

```bash
make plugin-deploy         # сборка плагина и развёртывание в testvault
make back                  # запуск сервера в режиме переднего плана (использует OBSIPUB_API_KEY / OBSIPUB_ROOT / OBSIPUB_PORT / OBSIPUB_HOST / OBSIPUB_TRUSTED_PROXIES)
make dev                   # сборка плагина, веб-фронтенда и Go-бэкенда; развёртывание плагина в testvault; запуск собранного сервера в режиме переднего плана с обслуживанием собранного веб-фронтенда (OBSIPUB_* сохранены)
```

Переменные настраиваются через окружение или аргументы make (`OBSIPUB_API_KEY=secret make back`).

## Проверки разработки

```bash
go test ./...
(cd web && npm run build)
(cd plugin && npm test && npm run deploy)
```
