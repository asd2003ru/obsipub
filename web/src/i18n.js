import { computed, ref } from 'vue'

const browserLanguage = typeof navigator !== 'undefined' ? navigator.language : ''
const requestedLocale = ref(/^ru(?:-|$)/i.test(String(browserLanguage || '')) ? 'ru' : 'en')
const messages = {
  ru: {
    emptyTitle: 'ObsiPub ждёт публикацию', emptyText: 'Откройте заметку в Obsidian и отправьте её через плагин ObsiPub Publisher.',
    home: 'Главная', homeAria: 'Открыть главную заметку', notePath: 'Путь заметки', search: 'Поиск', theme: 'Цветовая тема', auto: 'Авто', light: 'Светлая', dark: 'Тёмная',
    notesTree: 'Дерево заметок', contents: 'Содержание', refreshTree: 'Обновить дерево', loading: 'Загрузка…', dependencyTree: 'Дерево зависимостей', error: 'Ошибка', openIndex: 'Открыть index',
    showDocument: 'Показать документ', showSource: 'Показать исходный Markdown', copyMarkdown: 'Копировать Markdown', copyFailed: 'Не удалось скопировать Markdown', searchLoading: 'Поиск…', copy: 'Копировать', copied: 'Скопировано', operationError: 'Ошибка',
    openError: 'Не удалось открыть {path}: {error}', treeError: 'Не удалось загрузить дерево заметок: {error}', searchError: 'Поиск недоступен: {error}', excalidraw: 'Рисунок Excalidraw',
    collapse: 'Свернуть папку', expand: 'Раскрыть папку', collapseShort: 'Свернуть', expandShort: 'Раскрыть', truncated: 'Показана максимальная глубина',
    fullWidthOn: 'Полная ширина', fullWidthOff: 'Обычная ширина',
    drawingLoading: 'Загрузка рисунка…', drawingError: 'Не удалось отобразить рисунок: {error}', invalidScene: 'элементы сцены не найдены', invalidFormat: 'формат Excalidraw не распознан', drawingControls: 'Управление рисунком', fit: 'Вписать рисунок', zoomOut: 'Отдалить', zoomIn: 'Приблизить', close: 'Закрыть', authTitle: 'Публикация защищена', authText: 'Введите пароль, чтобы открыть эту публикацию.', authPassword: 'Пароль', authSubmit: 'Войти', authError: 'Не удалось войти: {error}'
  },
  en: {
    emptyTitle: 'ObsiPub is waiting for a publication', emptyText: 'Open a note in Obsidian and send it through the ObsiPub Publisher plugin.',
    home: 'Home', homeAria: 'Open home note', notePath: 'Note path', search: 'Search', theme: 'Color theme', auto: 'Auto', light: 'Light', dark: 'Dark',
    notesTree: 'Notes tree', contents: 'Contents', refreshTree: 'Refresh tree', loading: 'Loading…', dependencyTree: 'Dependency tree', error: 'Error', openIndex: 'Open index',
    showDocument: 'Show document', showSource: 'Show raw Markdown', copyMarkdown: 'Copy Markdown', copyFailed: 'Failed to copy Markdown', searchLoading: 'Searching…', copy: 'Copy', copied: 'Copied', operationError: 'Error',
    openError: 'Could not open {path}: {error}', treeError: 'Could not load note tree: {error}', searchError: 'Search unavailable: {error}', excalidraw: 'Excalidraw drawing',
    collapse: 'Collapse folder', expand: 'Expand folder', collapseShort: 'Collapse', expandShort: 'Expand', truncated: 'Maximum depth shown',
    fullWidthOn: 'Full width', fullWidthOff: 'Standard width',
    drawingLoading: 'Loading drawing…', drawingError: 'Could not display drawing: {error}', invalidScene: 'scene elements not found', invalidFormat: 'Excalidraw format not recognized', drawingControls: 'Drawing controls', fit: 'Fit drawing', zoomOut: 'Zoom out', zoomIn: 'Zoom in', close: 'Close', authTitle: 'Protected publication', authText: 'Enter the password to open this publication.', authPassword: 'Password', authSubmit: 'Sign in', authError: 'Sign-in failed: {error}'
  }
}

export const locale = computed(() => requestedLocale.value === 'ru' ? 'ru' : 'en')
export function t(key, vars = {}) {
  let value = messages[locale.value][key] ?? messages.en[key] ?? key
  return value.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '')
}
