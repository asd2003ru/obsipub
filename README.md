# ObsiPub

`obsipub` displays published Obsidian Markdown notes as a website. The Go/Fiber server serves the current publication; the Obsidian plugin creates and uploads it.

## Run the server

```bash
go run ./cmd/obsipub --api-key 'replace-with-a-secret'
```

The server starts in API-only mode: it creates `notes/` if missing and preserves existing publications, then shows a waiting page and accepts a publication through the API. Set the same API key in the Obsidian plugin.

| Setting | Flag | Environment | Default |
| --- | --- | --- | --- |
| Published root | `--root`, `-r` | `OBSIPUB_ROOT` | `notes/` |
| Publication key | `--api-key` | `OBSIPUB_API_KEY` | empty (optional; uploads and admin disabled) |
| Host | `--host` | `OBSIPUB_HOST` | `localhost` |
| Port | `--port` | `OBSIPUB_PORT` | `8088` |
| Trusted proxies | `--trusted-proxy` | `OBSIPUB_TRUSTED_PROXIES` | empty (comma-separated IPs/CIDRs) |

The `--api-key` (`OBSIPUB_API_KEY`) is optional. If omitted, the server still starts, creates `notes/` if missing, preserves existing publications, and serves them; however `POST /api/publish` and all `/api/admin/*` endpoints are disabled and return 401 unauthorized. Configuring an API key is required for plugin uploads and administration.

If no API key is configured, the `obsipub_auth` cookie signing key is a safe random 32-byte value generated at startup. This means cookies for password-protected publications are invalidated after every restart.

The server starts and serves existing public publications even without a configured key; configure a key for uploads and admin management.

### External web frontend

The frontend is served from `web/dist` (built with `npm run build` in the `web/` directory). The server reads the frontend directly from that external directory at runtime.

## Obsidian plugin

The plugin source is in [`plugin/`](plugin/README.md). Build and deploy it to the included test vault:

```bash
cd plugin
npm install
npm run deploy
```

Then enable **ObsiPub Publisher** in `testvault` (or copy `manifest.json`, `main.js`, and `styles.css` to `<vault>/.obsidian/plugins/obsipub/`). Configure the server URL and API key in its settings, open a Markdown note, and run **Publish active note** or click the upload ribbon icon.

The plugin collects resolved internal notes, embeds, attachments and Excalidraw files; preserves vault-relative folders; copies the active custom theme directory; writes `index.json`; then sends the ZIP to the server.

## Publication API

`POST /api/publish`

- Header: `X-API-Key: <OBSIPUB_API_KEY>`
- Content type: `application/zip`
- ZIP root must contain an `index.json` with `{ "version": 1, "index": "...md", "theme": ".themes/.../theme.css" | "", "tree": { ... } }`.

Archives are validated in a temporary directory before replacing `notes/`. Absolute paths, traversal, symlinks, duplicate paths, missing main articles and malformed manifests are rejected. The archive is bounded to 10,000 files and 512 MiB compressed/uncompressed data.

## Multisite publications

The server hosts independent publications under `/<prefix>`. Each publication lives in `root/<prefix>`; the legacy default (empty prefix) remains at the root.

### Upload format

`POST /api/publish` requires an API key to be configured; without it the endpoint rejects all requests with 401 unauthorized. When configured, the endpoint requires:

- `X-API-Key`: the configured `OBSIPUB_API_KEY`.
- `Content-Type: application/zip`
- `X-ObsiPub-Prefix`: URL-safe segment (`1–64` chars; `A–Z a–z 0–9 - _`; not `.` or `..`; must pass `ValidatePrefix`). Empty means the legacy default root. The plugin dialog makes the prefix optional — leave it blank to publish to the root URL (`/<prefix>/` defaults to `/`).
- `X-ObsiPub-Password`: optional plaintext. Empty = public publication. Non-empty is hashed server-side (`sha256:` hex) and stored in the manifest's `passwordHash`; the server never stores plaintext.

The ZIP must contain `index.json` with `{ "version": 1, "index": "...md", "theme": ".themes/.../theme.css" | "", "tree": { ... } }`. The server adds the validated prefix and server-generated password hash, then writes the resulting `index.json` into `root/<prefix>/`.

### URL structure

- Public/protected site homepage: `/<prefix>/` (default: `/`).
- Config: `GET /<prefix>/api/config`
- Markdown: `GET /<prefix>/api/markdown?path=<path>`
- Search: `GET /<prefix>/api/search?q=<q>`
- Links/tree: `GET /<prefix>/api/links?root=<path>&depth=<1-64>` (default depth `4`, max `64`)
- Raw assets: `GET /<prefix>/api/raw?path=<path>&from=<from>`
- Theme CSS: `GET /<prefix>/api/theme`
- Auth status: `GET /<prefix>/api/auth/status`
- Auth login: `POST /<prefix>/api/auth/login` with JSON body `{"password":"..."}`
- Static assets and SPA fallback: `GET /<prefix>/*` and `GET /<prefix>/`.

The web app derives `basePath` from `window.location.pathname`, so links stay under the publication prefix and work behind reverse proxies.

### Password behavior and auth

- Empty `X-ObsiPub-Password` → public (`manifest.HasPassword()` is false). No cookie required.
- Non-empty password → protected. The server compares passwords with constant-time `subtle.ConstantTimeCompare` against the `sha256:` hash.
- All protected publication resources (`/api/config`, `/api/markdown`, `/api/search`, `/api/links`, `/api/raw`, `/api/theme`, static files, and SPA fallback) enforce auth before serving content.
- Public endpoints (`/api/auth/status`, `/api/auth/login`) remain unprotected so the login form can load.

### Cookie expectations

On successful login the server sets a cookie named `obsipub_auth`:

- Value: base64-encoded payload (`prefix.expiry`) + `.signature` signed with HMAC-SHA256.
- Signing key: SHA-256 of `OBSIPUB_API_KEY`; if no API key is configured, a safe random 32-byte key is generated at startup, so cookies for password-protected publications are invalidated after every restart.
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/<prefix>` (or `/` for default), `MaxAge=7*24*60*60` (7 days).
- `Secure`: enabled when `c.Protocol() == "https"` or the request includes `X-Forwarded-Proto: https`.
- Scope: the cookie is validated only against the publication prefix in its payload, so it applies to that prefix's resources.

### Quick-link authorization

Protected publications can be opened with a quick authorization link that includes the password in the query string, for example:

```
http://localhost/zzz?pwd=password
```

When the server receives a protected frontend GET with `?pwd=<password>`, it verifies the password against the manifest. On success, it sets the same secure, prefix-scoped `obsipub_auth` cookie and redirects to the same URL with `pwd` removed so the password is not left in browser history or the address bar. On failure (invalid password), it continues to the normal auth shell (401 response with the login form). This works for both prefixed (`/<prefix>`) and default (`/`) protected publications.

**Warning:** Query-string passwords can leak through browser history, server access logs, referrer headers, and analytics. Use quick links cautiously and prefer the login form for regular access.

### Root publication

The plugin's publication prefix is optional. Leave it empty in the publish dialog to upload the publication to the server root (`http://localhost:8088/`). A non-empty prefix, such as `zzz`, continues to publish at `/zzz`.

### Reverse-proxy configuration

The server uses the current request origin and current prefix for URLs; it does not assume `localhost`. When running behind a reverse proxy:

- Pass `X-Forwarded-Proto: https` (or terminate TLS at the proxy) so the cookie gets `Secure`.
- The auth shell and API links use the prefix (`/docs/api/auth/status`), not host-root `/api/auth/status`.
- The web frontend builds all navigation, theme, raw asset, and API URLs from `publicationBasePath(window.location.pathname)`, so externally mapped hostnames and subpaths work without extra configuration beyond the proxy passing the correct `Host` and `X-Forwarded-Proto`.

- To trust proxy headers (`X-Forwarded-For`), configure `--trusted-proxy` or `OBSIPUB_TRUSTED_PROXIES` with comma-separated IPs/CIDRs. By default no proxy headers are trusted; when configured, `X-Forwarded-For` is used for client IP and cookie/proxy decisions are validated against the allowlist.
- The server uses structured text logging at `info` level by default (`CLOG_TYPE=text`, `CLOG_LEVEL=info` can override). Startup logs include program, listen address, root, and trusted proxy config. Request, auth failure, publication upload/deletion, and expiry lifecycle events are logged without exposing secrets.

`--trusted-proxy` and `OBSIPUB_TRUSTED_PROXIES` accept a comma-separated allowlist of proxy IP addresses or CIDR ranges, for example `10.0.0.10,10.0.0.0/24`. Do not configure `0.0.0.0/0` unless every client can be trusted to set forwarding headers. Set `CLOG_LEVEL=debug` for request proxy/auth details; passwords, API keys, and archive contents are never logged.

### Publication expiration

- Optional headers on `POST /api/publish`: `X-ObsiPub-TTL` (integer, 60..86400 seconds, calculated from server upload acceptance) or `X-ObsiPub-Expires-At` (RFC3339 timestamp from plugin local datetime converted to UTC). If neither is provided, the publication never expires.
- Conflicting, invalid, or past values are rejected with 400.
- Expired publications are physically removed (directory and manifest deleted) by a background janitor and by request-time checks. Once removed, all routes (API, auth, frontend, static) return 404 before auth checks.
- The SQLite store (`.<root-name>.obsipub-expiry.sqlite3`) is kept next to the server `<root>` so replacing the default publication cannot remove expiry metadata. SQLite remains the default and appropriate database because the service stores only expiry metadata; it is intentionally a small personal Obsidian notes publication service optimized for quick deployment locally, in Docker, or on a low-resource VPS. MySQL and PostgreSQL are not currently supported or needed for the primary use case, and would be considered only later for multi-instance/HA/shared metadata requirements.
- The plugin dialog supports three modes: No expiry, Relative (TTL in seconds), and Until date (local datetime converted to UTC RFC3339).
- Expiry is stored as server-side metadata in the SQLite coordinator store (`.<root-name>.obsipub-expiry.sqlite3`), not in `index.json`. The manifest (`index.json`) does not declare or write `expiresAt`; the plugin and admin APIs still return `expiresAt` through server responses.

### Publication management (admin)

The server provides API-key-protected management endpoints (require configured `OBSIPUB_API_KEY`; without it all admin requests are rejected with 401) for listing, deleting, and setting publication expiry:

- `GET /api/admin/publications` (`X-API-Key`) — lists all publications, including root (`prefix: ""`) and prefixed sites. Each entry includes `prefix`, `index`, `protected`, and `expiresAt` (Unix timestamp or `null`).
- `POST /api/admin/publications/delete` (`X-API-Key`, JSON `{"prefix":"..."}`) — deletes the publication directory and manifest; empty `prefix` deletes the root/default.
- `POST /api/admin/publications/expiry` (`X-API-Key`, JSON `{"prefix":"...","ttl":"..."}` or `{"prefix":"...","expiresAt":"..."}`) — sets or clears expiry. Both fields can be `null` (clear no-expiry). Conflicting `ttl` and `expiresAt` returns 400. `expiresAt` accepts RFC3339 (`2026-09-08T12:00:00Z`) or Unix timestamp (`1757323200`).

The plugin includes a **Manage publications** command (`Manage publications` ribbon/command) that opens a modal displaying publications, their URLs, protected status, and expiry. Users can set expiry (None / Relative TTL / Until date), confirm deletion, and refresh the list after mutations. Notices confirm actions.

### Legacy default publication compatibility and migration

- The existing single-site root (`notes/` or `--root`) stays available as the default publication (empty prefix, served at `/`). Uploads without `X-ObsiPub-Prefix` continue to write to the root.
- Migration to multisite: set a custom prefix in the plugin modal (prefilled randomly as `pub-<10 chars>`; editable) and upload with `X-ObsiPub-Prefix`. The new site appears at `/<prefix>/`; the old default remains intact until overwritten by an empty-prefix upload.
- Custom themes must still live under `.themes/<themeName>/theme.css` inside the archive (validated as `.themes/*/theme.css`).

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

Сервер запускается в режиме только с API: он создаёт `notes/`, если папка отсутствует, сохраняет существующие публикации, затем показывает страницу ожидания и принимает публикацию через API. Установите тот же API-ключ в плагине Obsidian.

| Параметр | Флаг | Переменная среды | По умолчанию |
| --- | --- | --- | --- |
| Корень публикации | `--root`, `-r` | `OBSIPUB_ROOT` | `notes/` |
| Ключ публикации | `--api-key` | `OBSIPUB_API_KEY` | пусто (опционально; загрузки и админ отключены) |
| Хост | `--host` | `OBSIPUB_HOST` | `localhost` |
| Порт | `--port` | `OBSIPUB_PORT` | `8088` |

`--api-key` (`OBSIPUB_API_KEY`) является опциональным. Если он не указан, сервер всё равно запускается, создаёт `notes/`, если папка отсутствует, сохраняет существующие публикации и обслуживает их; однако `POST /api/publish` и все конечные точки `/api/admin/*` отключены и возвращают 401 unauthorized. Для загрузок плагином и администрирования необходимо настроить API-ключ.

Если API-ключ не настроен, ключ подписи cookie `obsipub_auth` является безопасным случайным 32-байтовым значением, сгенерированным при запуске. Это означает, что cookie для публикаций с защитой паролем аннулируются после каждого перезапуска.

Сервер запускается и обслуживает существующие публичные публикации даже без настроенного ключа; настройте ключ для загрузок и управления администрацией.

### Внешний веб-фронтенд

Фронтенд обслуживается из `web/dist` (собирается через `npm run build` в директории `web/`). Сервер читает фронтенд напрямую из этой внешней директории во время выполнения.

## Плагин Obsidian

Исходный код плагина находится в [`plugin/`](plugin/README.md). Соберите и разверните его в прилагаемый тестовый vault:

```bash
cd plugin
npm install
npm run deploy
```

Затем включите **ObsiPub Publisher** в `testvault` (или скопируйте `manifest.json`, `main.js` и `styles.css` в `<vault>/.obsidian/plugins/obsipub/`). Настройте URL сервера и API-ключ в настройках плагина, откройте заметку Markdown и запустите **Publish active note** или нажмите значок загрузки на панели.

Плагин собирает разрешённые внутренние заметки, встраивания, вложения и файлы Excalidraw; сохраняет папки относительно vault; копирует активную директорию пользовательской темы; записывает `index.json`; затем отправляет ZIP на сервер.

## API публикации

`POST /api/publish`

Для работы конечной точки требуется настроенный API-ключ; без него конечная точка отклоняет все запросы с 401 unauthorized. Когда ключ настроен, конечная точка требует:

- Заголовок: `X-API-Key: <OBSIPUB_API_KEY>`
- Тип содержимого: `application/zip`
- Корень ZIP должен содержать `index.json` с `{ "version": 1, "index": "...md", "theme": ".themes/.../theme.css" | "", "tree": { ... } }`.

Архивы проверяются во временной директории перед заменой `notes/`. Абсолютные пути, обход каталогов, символические ссылки, дублирующие пути, отсутствующие основные статьи и некорректные манифесты отклоняются. Размер архива ограничен 10 000 файлов и 512 МиБ сжатых/несжатых данных.

## Мультисайтовые публикации

Сервер размещает независимые публикации под `/<prefix>`. Каждая публикация находится в `root/<prefix>`; устаревший вариант по умолчанию (пустой префикс) остаётся в корне.

### Формат загрузки

`POST /api/publish` требует настроенного API-ключа; без него конечная точка отклоняет все запросы с 401 unauthorized. Когда ключ настроен, конечная точка требует:

- `X-API-Key`: настроенный `OBSIPUB_API_KEY`.
- `Content-Type: application/zip`
- `X-ObsiPub-Prefix`: безопасный для URL сегмент (`1–64` символа; `A–Z a–z 0–9 - _`; не `.` или `..`; должен пройти `ValidatePrefix`). Пустое значение означает устаревший корень по умолчанию. Диалог плагина делает префикс опциональным — оставьте его пустым для публикации по корневому URL (`/<prefix>/` по умолчанию `/`).
- `X-ObsiPub-Password`: опциональный текст. Пусто = публичная публикация. Не пусто — хэшируется на стороне сервера (`sha256:` hex) и сохраняется в `passwordHash` манифеста; сервер никогда не хранит текст.

ZIP должен содержать `index.json` с `{ "version": 1, "index": "...md", "theme": ".themes/.../theme.css" | "", "tree": { ... } }`. Сервер добавляет проверенный префикс и сгенерированный на сервере хэш пароля, затем записывает полученный `index.json` в `root/<prefix>/`.

### Структура URL

- Домашняя страница публичного/защищённого сайта: `/<prefix>/` (по умолчанию: `/`).
- Конфигурация: `GET /<prefix>/api/config`
- Markdown: `GET /<prefix>/api/markdown?path=<path>`
- Поиск: `GET /<prefix>/api/search?q=<q>`
- Ссылки/дерево: `GET /<prefix>/api/links?root=<path>&depth=<1-64>` (по умолчанию depth `4`, максимум `64`)
- Необработанные ресурсы: `GET /<prefix>/api/raw?path=<path>&from=<from>`
- CSS темы: `GET /<prefix>/api/theme`
- Статус авторизации: `GET /<prefix>/api/auth/status`
- Вход в авторизацию: `POST /<prefix>/api/auth/login` с JSON-телом `{"password":"..."}`
- Статические ресурсы и резервный SPA: `GET /<prefix>/*` и `GET /<prefix>/`.

Веб-приложение определяет `basePath` из `window.location.pathname`, поэтому ссылки остаются в пределах префикса публикации и работают за обратным прокси.

### Поведение пароля и авторизация

- Пустой `X-ObsiPub-Password` → публичный (`manifest.HasPassword()` false). Cookie не требуется.
- Непустой пароль → защищённый. Сервер сравнивает пароли с помощью `subtle.ConstantTimeCompare` с постоянным временем с хэшем `sha256:`.
- Все защищённые ресурсы публикации (`/api/config`, `/api/markdown`, `/api/search`, `/api/links`, `/api/raw`, `/api/theme`, статические файлы и резервный SPA) требуют авторизации перед обслуживанием содержимого.
- Публичные конечные точки (`/api/auth/status`, `/api/auth/login`) остаются незащищёнными, чтобы форма входа могла загружаться.

### Ожидания cookie

При успешном входе сервер устанавливает cookie с именем `obsipub_auth`:

- Значение: base64-кодированная полезная нагрузка (`prefix.expiry`) + `.signature`, подписанная с помощью HMAC-SHA256.
- Ключ подписи: SHA-256 от `OBSIPUB_API_KEY`; если API-ключ не настроен, генерируется безопасный случайный 32-байтовый ключ при запуске, поэтому cookie для публикаций с защитой паролем аннулируются после каждого перезапуска.
- Атрибуты: `HttpOnly`, `SameSite=Lax`, `Path=/<prefix>` (или `/` для варианта по умолчанию), `MaxAge=7*24*60*60` (7 дней).
- `Secure`: включается, когда `c.Protocol() == "https"` или запрос содержит `X-Forwarded-Proto: https`.
- Область действия: cookie проверяется только по префиксу публикации в своей полезной нагрузке, поэтому применяется к ресурсам этого префикса.

### Быстрая авторизация по ссылке

Защищённые публикации можно открыть с помощью быстрой ссылки авторизации, включающей пароль в строке запроса, например:

```
http://localhost/zzz?pwd=password
```

Когда сервер получает защищённый запрос GET фронтенда с `?pwd=<password>`, он проверяет пароль по манифесту. При успехе устанавливает тот же безопасный cookie `obsipub_auth`, ограниченный префиксом, и перенаправляет на тот же URL с удалённым `pwd`, чтобы пароль не остался в истории браузера или в адресной строке. При неудаче (некорректный пароль) переходит к обычной оболочке авторизации (ответ 401 с формой входа). Работает как для префиксных (`/<prefix>`), так и для стандартных (`/`) защищённых публикаций.

**Предупреждение:** Пароли в строке запроса могут утечь через историю браузера, журналы доступа сервера, заголовки referrer и аналитику. Используйте быстрые ссылки с осторожностью и предпочитайте форму входа для регулярного доступа.

### Корневая публикация

Префикс публикации в плагине является опциональным. Оставьте его пустым в диалоге публикации, чтобы загрузить публикацию в корень сервера (`http://localhost:8088/`). Непустой префикс, например `zzz`, публикует по адресу `/zzz`.

### Конфигурация обратного прокси

Сервер использует текущий источник запроса и текущий префикс для URL; он не предполагает `localhost`. При работе за обратным прокси:

- Передайте `X-Forwarded-Proto: https` (или завершите TLS на прокси), чтобы cookie получил атрибут `Secure`.
- Оболочка авторизации и ссылки API используют префикс (`/docs/api/auth/status`), а не `/api/auth/status` в корне хоста.
- Фронтенд веб-приложения формирует все ссылки навигации, темы, необработанных ресурсов и API из `publicationBasePath(window.location.pathname)`, поэтому внешние отображения имён хостов и подпути работают без дополнительной конфигурации, кроме прокси, передающего правильные `Host` и `X-Forwarded-Proto`.
- `--trusted-proxy` и `OBSIPUB_TRUSTED_PROXIES` принимают список IP-адресов прокси или CIDR через запятую, например `10.0.0.10,10.0.0.0/24`. По умолчанию заголовки прокси не доверяются. Для подробного разбора запросов установите `CLOG_LEVEL=debug`; пароли, API-ключи и содержимое архивов в лог не попадают.

### Истечение публикации

- Опциональные заголовки в `POST /api/publish`: `X-ObsiPub-TTL` (целое число, 60..86400 секунд, рассчитано с момента принятия загрузки сервером) или `X-ObsiPub-Expires-At` (временная метка RFC3339 из локального времени плагина, преобразованного в UTC). Если ни один не указан, публикация никогда не истекает.
- Конфликтующие, некорректные или прошедшие значения отклоняются с 400.
- Истёкшие публикации физически удаляются (директория и манифест удаляются) фоновым уборщиком и проверками во время запроса. После удаления все маршруты (API, авторизация, фронтенд, статические) возвращают 404 перед проверками авторизации.
- Хранилище SQLite (`.<имя-корня>.obsipub-expiry.sqlite3`) хранится рядом с `<root>` сервера, поэтому замена публикации по умолчанию не может удалить метаданные истечения. SQLite остаётся базой данных по умолчанию и уместна, так как сервис хранит только метаданные истечения; это намеренно небольшой персональный сервис публикации заметок Obsidian, оптимизированный для быстрого развёртывания локально, в Docker или на VPS с небольшими ресурсами. MySQL и PostgreSQL в настоящее время не поддерживаются и не требуются для основного сценария использования; они будут рассмотрены только позже для требований к многократным экземплярам/HA/общим метаданным.
- Диалог плагина поддерживает три режима: Без истечения, Относительное (TTL в секундах) и До даты (локальное время, преобразованное в UTC RFC3339).
- Истечение хранится как серверные метаданные в хранилище SQLite координатора (`.<имя-корня>.obsipub-expiry.sqlite3`), а не в `index.json`. Манифест (`index.json`) не объявляет и не записывает `expiresAt`; API плагина и администратора всё равно возвращают `expiresAt` через ответы сервера.

### Управление публикациями (администрирование)

Сервер предоставляет конечные точки управления, защищённые API-ключом (требуется настроенный `OBSIPUB_API_KEY`; без него все запросы администратора отклоняются с 401), для просмотра списка, удаления и установки истечения публикаций:

- `GET /api/admin/publications` (`X-API-Key`) — список всех публикаций, включая корневую (`prefix: ""`) и префиксные сайты. Каждая запись содержит `prefix`, `index`, `protected` и `expiresAt` (временная метка Unix или `null`).
- `POST /api/admin/publications/delete` (`X-API-Key`, JSON `{"prefix":"..."}`) — удаляет директорию публикации и манифест; пустой `prefix` удаляет корневую/по умолчанию.
- `POST /api/admin/publications/expiry` (`X-API-Key`, JSON `{"prefix":"...","ttl":"..."}` или `{"prefix":"...","expiresAt":"..."}`) — устанавливает или очищает истечение. Оба поля могут быть `null` (очистить без истечения). Конфликтующие `ttl` и `expiresAt` возвращают 400. `expiresAt` принимает RFC3339 (`2026-09-08T12:00:00Z`) или временную метку Unix (`1757323200`).

Плагин включает команду **Manage publications** (команда/значок на панели `Manage publications`), которая открывает модальное окно с публикациями, их URL, статусом защиты и истечением. Пользователи могут установить истечение (None / Relative TTL / Until date), подтвердить удаление и обновить список после изменений. Уведомления подтверждают действия.

### Совместимость устаревшей корневой публикации и миграция

- Существующий одно-сайтовый корень (`notes/` или `--root`) остаётся доступным как публикация по умолчанию (пустой префикс, обслуживается по `/`). Загрузки без `X-ObsiPub-Prefix` продолжают записываться в корень.
- Миграция на мультисайт: установите пользовательский префикс в модальном окне плагина (по умолчанию случайный `pub-<10 chars>`; редактируемый) и загрузите с `X-ObsiPub-Prefix`. Новый сайт появляется по адресу `/<prefix>/`; старая публикация по умолчанию остаётся нетронутой до перезаписи загрузкой с пустым префиксом.
- Пользовательские темы должны по-прежнему находиться под `.themes/<themeName>/theme.css` внутри архива (проверяется как `.themes/*/theme.css`).

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
