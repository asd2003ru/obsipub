# Темы / Themes

## English

This doc describes creating custom themes for ObsiPub publications.

### Where to place

User themes live under `.obsidian/obsipub/themes/<theme-id>/` as a directory. The entry CSS must be named `theme.css`. An optional `manifest.json` can provide a display name and entry file reference.

```
<vault>/.obsidian/obsipub/themes/nord/
  theme.css
  manifest.json (optional)
  assets/ (optional relative assets)
```

The theme is selected in the publish dialog and packaged as `.themes/obsipub/<theme-id>/`. The manifest `theme` points to the nested entry CSS (`.themes/obsipub/<theme-id>/theme.css`). Relative assets in CSS work through the virtual endpoint `/api/theme/<theme-id>/` (for example, `url('assets/image.png')` resolves to `/api/theme/<theme-id>/assets/image.png`).

### Selectors

Use `body.theme-light` and `body.theme-dark` for modes.

```css
body.theme-light { --accent: #3a5ca8; }
body.theme-dark  { --accent: #6b8cce; }
```

### Important CSS variables

- `--bg`, `--panel`, `--text`, `--muted`, `--border`
- `--accent`, `--accent-soft`, `--danger`, `--danger-bg`
- `--code-bg`, `--shadow`
- `--obs-canvas`, `--obs-sidebar`, `--obs-topbar`, `--obs-border`, `--obs-text`, `--obs-muted`, `--obs-code-bg`
- `--link-color`
- `--callout-color-note`, `--callout-color-tip`, `--callout-color-warning`, `--callout-color-danger`, `--callout-color-question`, `--callout-color-quote`

### Built-in themes

In addition to **Classic** and **Contrast**, a **Nord** built-in theme is available. It uses the Base16 Nord palette with light (`body.theme-light`) and dark (`body.theme-dark`) modes and includes semantic variables and callout colors. Select it from the publication theme dropdown.

### Tinted converter

In plugin settings (**Tinted converter**), enter a scheme ID such as `tinted8-nord` or `base16-default`, then click **Convert**. The plugin fetches the YAML from `tinted-theming/schemes` (via GitHub raw source), validates and sanitizes the ID, parses the YAML safely, and writes `.obsidian/obsipub/themes/<safe-id>/theme.css` plus a small `manifest.json`. Both `body.theme-light` and `body.theme-dark` are generated sensibly from the palette. The selected folder theme can be deleted with the **Delete selected/user theme** button (confirmation required; only user theme directories are removed, never built-ins).

### Font profiles

The publication manifest supports an optional `font` field (`system`, `serif`, `mono`). Profile is selected in the plugin publish dialog and applied by the web UI via safe system font stacks. Existing archives without `font` remain fully compatible.

### Restrictions

Published theme CSS must not use external `@import` or absolute `url()` resources. Relative `url()` paths are resolved from the packaged theme folder. Arbitrary selectors, layout, fonts, and non-color variables require manual refinement.

### Preview and publish

The Theme Preview button uploads a temporary archive to the server and opens the link — it is a backend-backed preview, not just a style sample.

### Example

```css
/* my-theme.css — self-contained theme */
body.theme-light {
  --bg: #f5f7fa;
  --panel: #ffffff;
  --text: #1a2332;
  --muted: #5a6b7b;
  --border: #c8d1e0;
  --accent: #2a5ca8;
  --accent-soft: rgba(42, 92, 168, 0.1);
  --code-bg: #eef3f8;
  --link-color: #2a5ca8;
  --obs-canvas: #f5f7fa;
  --obs-sidebar: #ffffff;
  --obs-topbar: #eef3f8;
  --obs-border: #c8d1e0;
  --obs-text: #1a2332;
  --obs-muted: #5a6b7b;
  --obs-code-bg: #eef3f8;
}

body.theme-dark {
  --bg: #0f1322;
  --panel: #161b2e;
  --text: #e6eaf0;
  --muted: #9aa3b8;
  --border: #2a3050;
  --accent: #6b8cce;
  --accent-soft: rgba(107, 140, 206, 0.15);
  --code-bg: #1a2035;
  --link-color: #6b8cce;
  --obs-canvas: #0f1322;
  --obs-sidebar: #161b2e;
  --obs-topbar: #1c2338;
  --obs-border: #2a3050;
  --obs-text: #e6eaf0;
  --obs-muted: #9aa3b8;
  --obs-code-bg: #1a2035;
}
```

---

## Русский

Документ описывает создание пользовательских тем для публикаций ObsiPub.

### Где размещать

Пользовательские темы размещаются как папки в `.obsidian/obsipub/themes/<theme-id>/`. Входной CSS должен называться `theme.css`. Необязательный `manifest.json` может содержать имя и ссылку на вход.

```
<vault>/.obsidian/obsipub/themes/nord/
  theme.css
  manifest.json (необязательно)
  assets/ (необязательные относительные ресурсы)
```

Тема выбирается в диалоге публикации и включается в архив как `.themes/obsipub/<theme-id>/`. Манифест `theme` указывает на вложенный CSS (`.themes/obsipub/<theme-id>/theme.css`). Относительные ресурсы CSS работают через виртуальный эндпоинт `/api/theme/<theme-id>/` (например, `url('assets/icon.svg')` разрешается в `/api/theme/<theme-id>/assets/icon.svg`).

### Селекторы

Используйте `body.theme-light` и `body.theme-dark` для режимов.

```css
body.theme-light { --accent: #3a5ca8; }
body.theme-dark  { --accent: #6b8cce; }
```

### Важные CSS-переменные

- `--bg`, `--panel`, `--text`, `--muted`, `--border`
- `--accent`, `--accent-soft`, `--danger`, `--danger-bg`
- `--code-bg`, `--shadow`
- `--obs-canvas`, `--obs-sidebar`, `--obs-topbar`, `--obs-border`, `--obs-text`, `--obs-muted`, `--obs-code-bg`
- `--link-color`
- `--callout-color-note`, `--callout-color-tip`, `--callout-color-warning`, `--callout-color-danger`, `--callout-color-question`, `--callout-color-quote`

### Встроенные темы

Помимо **Классической** и **Контрастной**, доступна встроенная тема **Nord**. Она использует палитру Base16 Nord с режимами light (`body.theme-light`) и dark (`body.theme-dark`) и включает семантические переменные и цвета callout. Выберите её в выпадающем списке темы публикации.

### Конвертер Tinted

В настройках плагина (**Tinted converter**) введите ID схемы, например `tinted8-nord` или `base16-default`, затем нажмите **Convert**. Плагин загружает YAML из репозитория `tinted-theming/schemes` через GitHub raw, проверяет и очищает ID, безопасно парсит YAML и записывает `.obsidian/obsipub/themes/<safe-id>/theme.css` вместе с `manifest.json`. Генерируются оба режима (`body.theme-light` и `body.theme-dark`). Удаление выбранной пользовательской темы выполняется кнопкой **Delete selected/user theme** (требуется подтверждение; удаляются только папки тем пользователя, никогда встроенные).

### Профили шрифтов

Манифест публикации поддерживает необязательное поле `font` (`system`, `serif`, `mono`). Профиль выбирается в диалоге публикации плагина и применяется веб-интерфейсом через безопасные системные стеки шрифтов. Существующие архивы без `font` остаются полностью совместимыми.

### Ограничения

Тема должна быть самодостаточной: внешние `@import` не поддерживаются. Ресурсы `url()` могут быть относительными (например, `assets/icon.svg`) и обслуживаются через виртуальный эндпоинт `/api/theme/<theme-id>/`. Произвольные селекторы, макеты, шрифты и непеременные цвета требуют ручной доработки.

### Предпросмотр и публикация

В диалоге публикации кнопка **Theme Preview** загружает временный архив на сервер и открывает ссылку в браузере — это предпросмотр с бэкендом, а не просто образец стиля.

### Пример

```css
/* my-theme.css — самодостаточная тема */
body.theme-light {
  --bg: #f5f7fa;
  --panel: #ffffff;
  --text: #1a2332;
  --muted: #5a6b7b;
  --border: #c8d1e0;
  --accent: #2a5ca8;
  --accent-soft: rgba(42, 92, 168, 0.1);
  --code-bg: #eef3f8;
  --link-color: #2a5ca8;
  --obs-canvas: #f5f7fa;
  --obs-sidebar: #ffffff;
  --obs-topbar: #eef3f8;
  --obs-border: #c8d1e0;
  --obs-text: #1a2332;
  --obs-muted: #5a6b7b;
  --obs-code-bg: #eef3f8;
}

body.theme-dark {
  --bg: #0f1322;
  --panel: #161b2e;
  --text: #e6eaf0;
  --muted: #9aa3b8;
  --border: #2a3050;
  --accent: #6b8cce;
  --accent-soft: rgba(107, 140, 206, 0.15);
  --code-bg: #1a2035;
  --link-color: #6b8cce;
  --obs-canvas: #0f1322;
  --obs-sidebar: #161b2e;
  --obs-topbar: #1c2338;
  --obs-border: #2a3050;
  --obs-text: #e6eaf0;
  --obs-muted: #9aa3b8;
  --obs-code-bg: #1a2035;
}
```
