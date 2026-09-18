# Темы / Themes

## English

This doc describes creating custom themes for ObsiPub publications.

### Where to place

Place the `.css` file in the vault (top-level directory only):
```
<vault>/.obsidian/obsipub/themes/my.css
```
The file is selected in the publish dialog and packaged as `.themes/obsipub/my.css`.

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

### Restrictions

Do not use `url()` or `@import`. Theme must be self-contained.

Arbitrary selector/layout/asset conversion is not supported.

### Quick color conversion

Run from the repository root:

```bash
node tools/convert-obsidian-theme.mjs /path/to/obsidian/theme.css /path/to/vault/.obsidian/obsipub/themes/my.css
```

Only literal color tokens are mapped; review both modes and visual contrast manually. The output file is never overwritten. Variables `var(...)`, arbitrary selectors, layout and fonts require manual refinement. Conversion is rejected if `url()` or `@import` is present; the existing output file is not overwritten. If colors for one mode are missing in the source, add them manually. After conversion, check contrast and preview.

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

Положите файл `.css` в папку vault (только верхний уровень каталога):
```
<vault>/.obsidian/obsipub/themes/my.css
```
Файл выбирается в диалоге публикации и включается в архив как `.themes/obsipub/my.css`.

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

### Ограничения

Не используйте `url()` и `@import`. Тема должна быть самодостаточной.

Произвольная конвертация селекторов, макетов или ассетов не поддерживается.

### Быстрый перенос цветов из темы Obsidian

Из корня репозитория запустите:

```bash
node tools/convert-obsidian-theme.mjs /path/to/obsidian/theme.css /path/to/vault/.obsidian/obsipub/themes/my.css
```

Конвертер переносит **только буквальные цвета** из `body.theme-light` / `body.theme-dark` (также `.theme-light` / `.theme-dark`) для базовых переменных Obsidian: фон, текст, границы, акцент, ошибка и код. Переменные `var(...)`, произвольные селекторы, раскладка и шрифты требуют ручной доработки. При `url()` или `@import` конвертация отклоняется; существующий выходной файл не перезаписывается. Если в исходнике нет цветов одного из режимов, дополните его вручную. После конвертации проверьте контраст и предпросмотр.

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
