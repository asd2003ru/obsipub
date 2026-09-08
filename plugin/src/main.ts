import {
  App,
  getIcon,
  getLanguage,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath
} from "obsidian";
import { ArchiveEntry, createPublishZip, DependencyTreeNode, rewriteFrontmatterWithObsipub, sanitizeMarkdownFrontmatter } from "./archive";
import { buildPublicationUploadHeaders, isFutureExpiry, isValidPublicationPrefix, parsePublicationResponse, PublicationOptions, publicationURL, quickAuthPublicationURL, PublicationResponse } from "./publish-options";

interface ObsipubSettings {
  serverUrl: string;
  apiKey: string;
}

function isRussian(): boolean {
  try {
    return getLanguage().toLowerCase().startsWith("ru");
  } catch {
    return false;
  }
}

function t(key: string): string {
  const ru: Record<string, string> = {
    "managePublicationsTitle": "Управление публикациями",
    "managePublicationsDesc": "Публикации на этом сервере.",
    "managePublicationsHeaderPrefix": "Публикация",
    "managePublicationsHeaderStatus": "Статус",
    "managePublicationsHeaderExpiry": "Истекает",
    "managePublicationsHeaderActions": "Действия",
    "statusProtected": "Защищено",
    "statusPublic": "Публично",
    "expiryNone": "Без срока",
    "expiryNoExpiry": "Без срока",
    "expiryRelative": "Относительно (TTL)",
    "expiryUntil": "До даты",
    "expiryUpdateBtn": "Обновить срок",
    "deleteBtnLabel": "Удалить",
    "deleteConfirm": "Удалить публикацию",
    "deleteConfirmBody": "Это действие нельзя отменить.",
    "updateExpiryBtn": "Обновить срок",
    "editExpiryBtnLabel": "Изменить срок",
    "editExpBtnLabel": "Изменить срок",
    "deleteBtnLabelAlt": "Удалить",
    "loadingPublications": "Загрузка публикаций...",
    "noPublicationsFound": "Публикации не найдены.",
    "failedLoadPublications": "Не удалось загрузить публикации:",
    "deleteFailed": "Ошибка удаления",
    "deleteSuccess": "Удалено",
    "expiryUpdated": "Срок обновлён для",
    "expiryUpdateFailed": "Не удалось обновить срок",
    "expiryUpdateError": "Ошибка обновления срока",
    "publishActiveNote": "Опубликовать активную заметку",
    "managePublications": "Управление публикациями",
    "publishNote": "Опубликовать заметку",
    "publishPublicationTitle": "Опубликовать публикацию",
    "publishPrefixName": "Префикс публикации (необязательно)",
    "publishPrefixDesc": "Оставьте пустым для корня сервера; иначе используйте безопасное имя URL.",
    "publishExpirationName": "Срок действия (необязательно)",
    "publishExpirationDesc": "Выберите, когда публикация должна истечь. Оставьте пустым для бессрочной.",
    "publishPasswordName": "Пароль (необязательно)",
    "publishPasswordDesc": "Оставьте пустым для публичной публикации.",
    "publishCancel": "Отмена",
    "publishBtn": "Опубликовать",
    "publishCopyUrl": "Скопировать URL публикации",
    "publishCopyQuickUrl": "Скопировать URL быстрого доступа",
    "publishCopied": "URL скопирован.",
    "publishFailedCopy": "Не удалось скопировать URL.",
    "publishQuickCopied": "URL быстрого доступа скопирован.",
    "publishQuickFailedCopy": "Не удалось скопировать URL быстрого доступа.",
    "publishRootLabel": "Корень сервера",
    "publishPrefixError": "Оставьте пустым для корня или используйте 1–64 букв, цифр, дефисов или подчеркиваний.",
    "publishChooseExpiryDate": "Выберите дату и время истечения срока.",
    "publishExpiryPast": "Дата истечения должна быть в будущем.",
    "publishOpenMarkdownNote": "Откройте заметку Markdown перед публикацией.",
    "publishConfigureServerUrl": "Сначала настройте URL сервера.",
    "publishConfigureApiKey": "Сначала настройте ключ API.",
    "publishFailedNotice": "Ошибка публикации",
    "manageFailedNotice": "Ошибка управления публикациями",
    "paginationPrevious": "Назад",
    "paginationNext": "Вперёд",
    "paginationPage": "Страница {page} из {total}",
    "publishCollecting": "Сбор зависимостей заметок...",
    "publishPublishedFiles": "Опубликовано файлов",
    "settingsTitle": "Издатель Obsipub",
    "serverUrlName": "URL сервера",
    "serverUrlDesc": "Базовый URL obsipub; публикация отправляет POST на /api/publish.",
    "serverUrlPlaceholder": "http://127.0.0.1:8088",
    "apiKeyName": "API-ключ",
    "apiKeyDesc": "Отправляется только в заголовке X-API-Key.",
    "apiKeyPlaceholder": "API-ключ",
    "showLineNumbersName": "Показывать номера строк в блоках кода",
    "showLineNumbersDesc": "Включить отображение номеров строк в блоках кода на опубликованном сайте.",
    "showArticleLineNumbersName": "Показывать номера строк статьи",
    "showArticleLineNumbersDesc": "Показывать номера логических строк Markdown-текста.",
    "resetProtectionName": "Опубликовать без пароля",
    "resetProtectionDesc": "Снять защиту с предыдущей публикации.",
    "publishPasswordRequired": "Введите новый пароль или выберите снятие защиты.",
    "cleanFrontmatterBtn": "Очистить метаданные",
    "cleanFrontmatterDesc": "Удалить устаревшие метаданные obsipub из заметок Markdown, сравнивая с текущими публикациями сервера.",
    "cleanFrontmatterSuccess": "Очищено файлов: {count}",
    "cleanFrontmatterNoFiles": "Устаревших метаданных не найдено.",
  };
  const en: Record<string, string> = {
    "managePublicationsTitle": "Manage publications",
    "managePublicationsDesc": "Publications hosted on this server.",
    "managePublicationsHeaderPrefix": "Publication",
    "managePublicationsHeaderStatus": "Status",
    "managePublicationsHeaderExpiry": "Expires",
    "managePublicationsHeaderActions": "Actions",
    "statusProtected": "Protected",
    "statusPublic": "Public",
    "expiryNone": "No expiry",
    "expiryNoExpiry": "No expiry",
    "expiryRelative": "Relative (TTL)",
    "expiryUntil": "Until date",
    "expiryUpdateBtn": "Update expiry",
    "deleteBtnLabel": "Delete",
    "deleteConfirm": "Delete publication",
    "deleteConfirmBody": "This cannot be undone.",
    "updateExpiryBtn": "Update expiry",
    "editExpiryBtnLabel": "Edit expiry",
    "editExpBtnLabel": "Edit expiry",
    "deleteBtnLabelAlt": "Delete",
    "loadingPublications": "Loading publications...",
    "noPublicationsFound": "No publications found.",
    "failedLoadPublications": "Failed to load publications:",
    "deleteFailed": "Delete failed",
    "deleteSuccess": "Deleted",
    "expiryUpdated": "Expiry updated for",
    "expiryUpdateFailed": "Expiry update failed",
    "expiryUpdateError": "Expiry update error",
    "publishActiveNote": "Publish active note",
    "managePublications": "Manage publications",
    "publishNote": "Publish active note to obsipub",
    "publishPublicationTitle": "Publish publication",
    "publishPrefixName": "Publication prefix (optional)",
    "publishPrefixDesc": "Leave empty to publish at the server root; otherwise use a URL-safe name.",
    "publishExpirationName": "Expiration (optional)",
    "publishExpirationDesc": "Choose when this publication should expire. Leave empty for no expiry.",
    "publishPasswordName": "Password (optional)",
    "publishPasswordDesc": "Leave empty to make the publication public.",
    "publishCancel": "Cancel",
    "publishBtn": "Publish",
    "publishCopyUrl": "Copy publication URL",
    "publishCopyQuickUrl": "Copy quick-auth URL",
    "publishCopied": "Publication URL copied.",
    "publishFailedCopy": "Failed to copy URL.",
    "publishQuickCopied": "Quick-auth URL copied.",
    "publishQuickFailedCopy": "Failed to copy quick-auth URL.",
    "publishRootLabel": "Root (/)",
    "publishPrefixError": "Leave blank for root, or use 1–64 letters, numbers, hyphens, or underscores.",
    "publishChooseExpiryDate": "Choose an expiration date and time.",
    "publishExpiryPast": "Expiration must be in the future.",
    "publishOpenMarkdownNote": "Open a Markdown note before publishing.",
    "publishConfigureServerUrl": "Configure the server URL first.",
    "publishConfigureApiKey": "Configure the API key first.",
    "publishFailedNotice": "Publish failed",
    "manageFailedNotice": "Manage publications failed",
    "paginationPrevious": "Previous",
    "paginationNext": "Next",
    "paginationPage": "Page {page} of {total}",
    "publishCollecting": "Collecting note dependencies...",
    "publishPublishedFiles": "Published vault files",
    "settingsTitle": "Obsipub Publisher",
    "serverUrlName": "Server URL",
    "serverUrlDesc": "Base URL of obsipub; publishing POSTs to /api/publish.",
    "serverUrlPlaceholder": "http://127.0.0.1:8088",
    "apiKeyName": "API key",
    "apiKeyDesc": "Sent only as the X-API-Key request header.",
    "apiKeyPlaceholder": "API key",
    "showLineNumbersName": "Show line numbers in code blocks",
    "showLineNumbersDesc": "Include line-number display in the published site's code blocks.",
    "showArticleLineNumbersName": "Show article line numbers",
    "showArticleLineNumbersDesc": "Show logical Markdown source line numbers.",
    "resetProtectionName": "Publish without password",
    "resetProtectionDesc": "Remove protection from the previous publication.",
    "publishPasswordRequired": "Enter a new password or choose to remove protection.",
    "cleanFrontmatterBtn": "Clean frontmatter",
    "cleanFrontmatterDesc": "Remove stale obsipub metadata from vault Markdown notes based on current server publications.",
    "cleanFrontmatterSuccess": "Cleaned {count} file(s).",
    "cleanFrontmatterNoFiles": "No stale metadata found.",
  };
  return isRussian() ? (ru[key] ?? en[key] ?? key) : (en[key] ?? key);
}

const DEFAULT_SETTINGS: ObsipubSettings = {
  serverUrl: "http://127.0.0.1:8088",
  apiKey: ""
};

interface AdapterListing {
  files: string[];
  folders: string[];
}

export default class ObsipubPlugin extends Plugin {
  settings: ObsipubSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon("upload", t("publishNote"), () => {
      void this.publishActiveNote();
    });
    this.addRibbonIcon("settings", t("managePublications"), () => {
      void this.managePublications();
    });
    this.addCommand({
      id: "publish-active-note",
      name: t("publishActiveNote"),
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        const canPublish = activeFile instanceof TFile && activeFile.extension === "md";
        if (!checking && canPublish && activeFile) void this.publish(activeFile);
        return canPublish;
      }
    });
    this.addCommand({
      id: "manage-publications",
      name: t("managePublications"),
      checkCallback: (checking) => {
        if (!checking) void this.managePublications();
        return true;
      }
    });
    this.addSettingTab(new ObsipubSettingTab(this.app, this));
  }

  private async publishActiveNote(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file ?? this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== "md") {
      new Notice(t("publishOpenMarkdownNote"));
      return;
    }
    await this.publish(file);
  }

  private async publish(root: TFile): Promise<void> {
    if (!this.settings.serverUrl.trim()) {
      new Notice(t("publishConfigureServerUrl"));
      return;
    }
    if (!this.settings.apiKey.trim()) {
      new Notice(t("publishConfigureApiKey"));
      return;
    }

    try {
      // Read existing obsipub frontmatter from active note using flat scalar keys only
      const fileCache = this.app.metadataCache.getFileCache(root);
      const fm = (fileCache?.frontmatter as Record<string, unknown> | undefined) ?? {};
      const initialPrefix = typeof fm.obsipub_prefix === "string" ? fm.obsipub_prefix : "";
      const initialShowLineNumbers = fm.obsipub_showLineNumbers === true;
      const initialShowArticleLineNumbers = fm.obsipub_showArticleLineNumbers === true;
      let initialProtected = fm.obsipub_protected === true;
      const initialExpiresAt = typeof fm.obsipub_expire === "string" ? fm.obsipub_expire : "";

      // Validate expired publication using existing admin endpoint
      let expired = false;
      if (initialExpiresAt) {
        const storedExpiry = Date.parse(initialExpiresAt);
        expired = Number.isFinite(storedExpiry) && storedExpiry <= Date.now();
      }
      try {
        const adminUrl = `${this.settings.serverUrl.replace(/\/+$/, "")}/api/admin/publications`;
        const resp = await fetch(adminUrl, {
          headers: { "X-API-Key": this.settings.apiKey }
        });
        if (resp.ok) {
          const data = (await resp.json()) as Array<{ prefix?: string | null; protected?: boolean; expiresAt?: number | null }>;
          const pubInfo = data.find((p) => {
            const pStr = p.prefix ? String(p.prefix) : "";
            const existingPrefix = initialPrefix;
            return pStr === existingPrefix;
          });
          if (pubInfo && pubInfo.expiresAt && pubInfo.expiresAt > 0 && pubInfo.expiresAt < Date.now() / 1000) {
            expired = true;
          }
          if (pubInfo) initialProtected = pubInfo.protected === true;
        }
      } catch {
        // Ignore validation errors and continue
      }
      if (expired && !confirm(isRussian() ? "Эта публикация истекла. Продолжить с новой публикацией?" : "This publication has expired. Continue with a new publication?")) {
        return;
      }

      // Warn and confirm when obsipub.url belongs to a different configured server
      const existingUrl = typeof fm.obsipub_url === "string" ? fm.obsipub_url : "";
      if (existingUrl && existingUrl.trim()) {
        const configuredServerUrl = this.settings.serverUrl.trim().replace(/\/$/, "");
        try {
          const existingParsed = new URL(existingUrl);
          const configuredParsed = new URL(configuredServerUrl);
          const existingPath = existingParsed.pathname.replace(/\/[^/]*\/?$/, "") || "/";
          const configuredPath = configuredParsed.pathname.replace(/\/+$/, "") || "/";
          const existingBase = existingParsed.origin + existingPath;
          const configuredBase = configuredParsed.origin + configuredPath;
          if (existingBase !== configuredBase) {
            if (!confirm(isRussian()
              ? "URL заметки относится к другому серверу. Старые метаданные публикации будут заменены. Продолжить?"
              : "Note URL belongs to a different server. Old publication metadata will be replaced. Continue?")) {
              return;
            }
          }
        } catch {
          // If URL parsing fails, compare strings loosely
          if (existingUrl.replace(/\/$/, "") !== configuredServerUrl.replace(/\/$/, "")) {
            if (!confirm(isRussian()
              ? "URL заметки относится к другому серверу. Старые метаданные публикации будут заменены. Продолжить?"
              : "Note URL belongs to a different server. Old publication metadata will be replaced. Continue?")) {
              return;
            }
          }
        }
      }

      const options = await new PublicationOptionsModal(
        this.app,
        this.settings.serverUrl,
        initialPrefix,
        initialShowLineNumbers,
        initialShowArticleLineNumbers,
        initialProtected,
        initialExpiresAt
      ).openAndGetValue();
      if (!options) return;
      new Notice(t("publishCollecting"));
      const { files, tree } = this.collectDependencies(root);
      // Read files; sanitize Markdown entries to keep only title/tags frontmatter
      const rawEntries = await this.readFiles(files);
      const entries: ArchiveEntry[] = rawEntries.map((entry) => {
        if (entry.path.endsWith(".md")) {
          return { ...entry, bytes: sanitizeMarkdownFrontmatter(entry.bytes) };
        }
        return entry;
      });
      const theme = await this.addActiveTheme(entries);
      const index = {
        version: 1 as const,
        index: root.path,
        theme,
        showLineNumbers: options.showLineNumbers,
        showArticleLineNumbers: !!options.showArticleLineNumbers,
        tree
      };
      const zip = createPublishZip(entries, index);
      const publication = await this.upload(zip, options);
      const publicationUrl = publicationURL(this.settings.serverUrl, publication.prefix);
      await this.updateFrontmatterAfterPublish(
        root,
        publicationUrl,
        publication.prefix,
        publication.expiresAt,
        options.showLineNumbers,
        !!options.showArticleLineNumbers,
        options.resetProtection ? false : (initialProtected || !!options.password)
      );
      new Notice(`${t("publishPublishedFiles")} ${files.size} (${Math.ceil(zip.byteLength / 1024)} KiB): ${publicationUrl}`);
    } catch (error) {
      console.error(t("publishFailedNotice"), error);
      new Notice(`${t("publishFailedNotice")} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Uses Obsidian's resolved metadata cache for links and embeds. Every resolved
   * file is archived, while index.tree contains only outgoing Markdown notes.
   */
  private collectDependencies(root: TFile): { files: Set<TFile>; tree: DependencyTreeNode } {
    const files = new Set<TFile>();
    // The sidebar is a tree, not a graph: show every article once under its
    // first encountered parent. Assets and Excalidraw documents remain in ZIP.
    const visibleArticles = new Set<string>([root.path]);

    const visit = (current: TFile): DependencyTreeNode => {
      files.add(current);
      const children: DependencyTreeNode[] = [];
      const childPaths = new Set<string>();
      const cache = this.app.metadataCache.getFileCache(current);
      const references = [...(cache?.links ?? []), ...(cache?.embeds ?? [])];

      for (const reference of references) {
        // Heading/block fragments are not files. Obsidian resolves aliases and relative paths.
        const linkpath = reference.link.split("#", 1)[0].trim();
        if (!linkpath) continue;
        const destination = this.app.metadataCache.getFirstLinkpathDest(linkpath, current.path);
        if (!(destination instanceof TFile)) continue;
        files.add(destination);

        // Only ordinary Markdown notes belong to navigation. Excalidraw's
        // .excalidraw.md storage is an attachment, not an article.
        const isArticle = destination.extension === "md" && !destination.path.toLowerCase().endsWith(".excalidraw.md");
        if (!isArticle || childPaths.has(destination.path) || visibleArticles.has(destination.path)) continue;
        childPaths.add(destination.path);
        visibleArticles.add(destination.path);
        children.push(visit(destination));
      }

      return children.length
        ? { path: current.path, name: current.basename, children }
        : { path: current.path, name: current.basename };
    };

    return { files, tree: visit(root) };
  }

  private async readFiles(files: Set<TFile>): Promise<ArchiveEntry[]> {
    const ordered = [...files].sort((left, right) => left.path.localeCompare(right.path));
    return Promise.all(ordered.map(async (file) => ({
      path: file.path,
      bytes: new Uint8Array(await this.app.vault.readBinary(file))
    })));
  }

  /** Copies the configured custom theme, including fonts/assets, into the published archive. */
  private async addActiveTheme(entries: ArchiveEntry[]): Promise<string> {
    const adapter = this.app.vault.adapter;
    const appearancePath = ".obsidian/appearance.json";
    if (!(await adapter.exists(appearancePath))) return "";

    let themeName: string | undefined;
    try {
      themeName = JSON.parse(await adapter.read(appearancePath)).cssTheme;
    } catch (error) {
      console.warn("Obsipub could not read appearance.json", error);
      return "";
    }
    if (typeof themeName !== "string" || !themeName.trim()) return "";

    const sourceDir = normalizePath(`.obsidian/themes/${themeName}`);
    if (!(await adapter.exists(sourceDir))) return "";
    const targetDir = normalizePath(`.themes/${themeName}`);
    const paths = await this.listFilesRecursively(sourceDir);
    for (const sourcePath of paths) {
      const relativePath = sourcePath.slice(sourceDir.length + 1);
      entries.push({
        path: normalizePath(`${targetDir}/${relativePath}`),
        bytes: new Uint8Array(await adapter.readBinary(sourcePath))
      });
    }
    const themeCss = paths.find((path) => path.endsWith("/theme.css")) ?? paths.find((path) => path.endsWith(".css"));
    return themeCss ? normalizePath(`${targetDir}/${themeCss.slice(sourceDir.length + 1)}`) : "";
  }

  private async listFilesRecursively(directory: string): Promise<string[]> {
    const adapter = this.app.vault.adapter;
    const listing = await adapter.list(directory) as AdapterListing;
    const nested = await Promise.all(listing.folders.map((folder) => this.listFilesRecursively(folder)));
    return [...listing.files, ...nested.flat()].sort((left, right) => left.localeCompare(right));
  }

  private async upload(zip: Uint8Array, options: PublicationOptions): Promise<PublicationResponse> {
    const endpoint = `${this.settings.serverUrl.replace(/\/+$/, "")}/api/publish`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildPublicationUploadHeaders(this.settings.apiKey, options),
      body: zip
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
    }
    return parsePublicationResponse(await response.json());
  }

  private async managePublications(): Promise<void> {
    if (!this.settings.serverUrl.trim()) {
      new Notice(t("publishConfigureServerUrl"));
      return;
    }
    if (!this.settings.apiKey.trim()) {
      new Notice(t("publishConfigureApiKey"));
      return;
    }
    try {
      new ManagePublicationsModal(this.app, this.settings.serverUrl, this.settings.apiKey).open();
    } catch (error) {
      console.error(t("manageFailedNotice"), error);
      new Notice(`${t("manageFailedNotice")} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async updateFrontmatterAfterPublish(file: TFile, url: string, prefix: string, expiresAt: number | null | undefined, showLineNumbers: boolean, showArticleLineNumbers: boolean, protectedPublication: boolean): Promise<void> {
    const content = await this.app.vault.read(file);
    const rewritten = rewriteFrontmatterWithObsipub(content, {
      url,
      prefix,
      expire: expiresAt != null && expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : null,
      showLineNumbers,
      showArticleLineNumbers,
      protected: protectedPublication
    });
    await this.app.vault.modify(file, rewritten);
  }

  private async cleanFrontmatter(): Promise<void> {
    if (!this.settings.serverUrl.trim()) {
      new Notice(t("publishConfigureServerUrl"));
      return;
    }
    if (!this.settings.apiKey.trim()) {
      new Notice(t("publishConfigureApiKey"));
      return;
    }
    let serverPrefixes: Set<string> = new Set();
    try {
      const url = `${this.settings.serverUrl.replace(/\/+$/, "")}/api/admin/publications`;
      const resp = await fetch(url, {
        headers: { "X-API-Key": this.settings.apiKey }
      });
      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }
      const data = (await resp.json()) as Array<{ prefix?: string | null }>;
      for (const item of data) {
        const p = item.prefix ? String(item.prefix) : "";
        serverPrefixes.add(p);
      }
    } catch (e) {
      console.error("Failed to fetch server publications for clean:", e);
      new Notice(`${t("failedLoadPublications")} ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    const mdFiles = this.app.vault.getMarkdownFiles();
    let cleanedCount = 0;

    for (const file of mdFiles) {
      try {
        const fileCache = this.app.metadataCache.getFileCache(file);
        const currentFm = fileCache?.frontmatter ?? {};
        const flatPrefix = typeof currentFm.obsipub_prefix === "string" ? currentFm.obsipub_prefix : "";
        const prefix = flatPrefix;
        const hasMetadata = Object.keys(currentFm).some((key) => key === "obsipub" || key.startsWith("obsipub_"));
        if (!hasMetadata) {
          continue;
        }
        if (!serverPrefixes.has(prefix)) {
          let changed = false;
          await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            for (const key of Object.keys(fm)) {
              if (key === "obsipub" || key.startsWith("obsipub_")) {
                delete fm[key];
                changed = true;
              }
            }
          });
          if (changed) cleanedCount++;
        }
      } catch (e) {
        console.error("Failed to clean frontmatter for", file.path, e);
      }
    }

    if (cleanedCount > 0) {
      new Notice(t("cleanFrontmatterSuccess").replace("{count}", String(cleanedCount)));
    } else {
      new Notice(t("cleanFrontmatterNoFiles"));
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}


class PublicationOptionsModal extends Modal {
  private readonly serverUrl: string;
  private readonly initialPrefix: string;
  private readonly initialShowLineNumbers: boolean;
  private readonly initialShowArticleLineNumbers: boolean;
  private readonly initialProtected: boolean;
  private readonly initialExpiresAt: string;
  private resolveValue!: (value: PublicationOptions | undefined) => void;
  private settled = false;

  constructor(app: App, serverUrl: string, initialPrefix: string, initialShowLineNumbers: boolean, initialShowArticleLineNumbers: boolean, initialProtected: boolean, initialExpiresAt: string) {
    super(app);
    this.serverUrl = serverUrl;
    this.initialPrefix = initialPrefix;
    this.initialShowLineNumbers = initialShowLineNumbers;
    this.initialShowArticleLineNumbers = initialShowArticleLineNumbers;
    this.initialProtected = initialProtected;
    this.initialExpiresAt = initialExpiresAt;
  }

  openAndGetValue(): Promise<PublicationOptions | undefined> {
    this.open();
    return new Promise((resolve) => {
      this.resolveValue = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("publishPublicationTitle") });

    let prefix = this.initialPrefix;
    let password = "";
    let resetProtection = false;
    const prefixSetting = new Setting(contentEl)
      .setName(t("publishPrefixName"))
      .setDesc(t("publishPrefixDesc"))
      .addText((text) => text
        .setValue(prefix)
        .onChange((value) => { prefix = value.trim(); updatePreview(); }));
    const prefixError = contentEl.createEl("small", { cls: "obsipub-modal-error" });
    prefixError.style.color = "var(--text-error)";
    prefixError.style.display = "none";

    let showLineNumbers = this.initialShowLineNumbers;
    new Setting(contentEl)
      .setName(t("showLineNumbersName"))
      .setDesc(t("showLineNumbersDesc"))
      .addToggle((toggle) => toggle
        .setValue(showLineNumbers)
        .onChange((value) => { showLineNumbers = value; }));

    let showArticleLineNumbers = this.initialShowArticleLineNumbers;
    new Setting(contentEl)
      .setName(t("showArticleLineNumbersName"))
      .setDesc(t("showArticleLineNumbersDesc"))
      .addToggle((toggle) => toggle.setValue(showArticleLineNumbers).onChange((value) => { showArticleLineNumbers = value; }));

    if (this.initialProtected) {
      new Setting(contentEl)
        .setName(t("resetProtectionName"))
        .setDesc(t("resetProtectionDesc"))
        .addToggle((toggle) => toggle.setValue(false).onChange((value) => { resetProtection = value; }));
    }

    const urlRow = contentEl.createDiv({ cls: "obsipub-url-row" });
    urlRow.style.display = "flex";
    urlRow.style.alignItems = "center";
    urlRow.style.gap = "0.4rem";
    urlRow.style.marginTop = "0.25rem";
    urlRow.style.width = "100%";

    const urlLink = urlRow.createEl("a", { cls: "obsipub-url-link" });
    urlLink.style.color = "var(--text-muted)";
    urlLink.style.textDecoration = "none";
    urlLink.style.flex = "1 1 auto";
    urlLink.style.minWidth = "0";
    urlLink.style.overflowWrap = "anywhere";
    urlLink.setAttribute("target", "_blank");
    urlLink.setAttribute("rel", "noopener");

    const urlCopyBtn = urlRow.createEl("button", { cls: "obsipub-copy-btn" });
    urlCopyBtn.setAttribute("aria-label", t("publishCopyUrl"));
    urlCopyBtn.setAttribute("title", t("publishCopyUrl"));
    urlCopyBtn.style.display = "inline-flex";
    urlCopyBtn.style.alignItems = "center";
    urlCopyBtn.style.justifyContent = "center";
    urlCopyBtn.style.width = "1.55rem";
    urlCopyBtn.style.height = "1.55rem";
    urlCopyBtn.style.minWidth = "1.55rem";
    urlCopyBtn.style.padding = "0.15rem";
    urlCopyBtn.style.border = "1px solid var(--background-modifier-border)";
    urlCopyBtn.style.borderRadius = "0.35rem";
    urlCopyBtn.style.background = "var(--background-secondary)";
    urlCopyBtn.style.color = "var(--text-muted)";
    urlCopyBtn.style.cursor = "pointer";
    urlCopyBtn.style.display = "inline-flex";
    urlCopyBtn.style.alignItems = "center";
    urlCopyBtn.style.justifyContent = "center";
    urlCopyBtn.style.flex = "0 0 auto";
    urlCopyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

    urlCopyBtn.addEventListener("click", async () => {
      const url = publicationURL(this.serverUrl, prefix);
      try {
        await navigator.clipboard.writeText(url);
        new Notice(t("publishCopied"));
      } catch {
        new Notice(t("publishFailedCopy"));
      }
    });

    const quickRow = contentEl.createDiv({ cls: "obsipub-url-row" });
    quickRow.style.display = "none";
    quickRow.style.alignItems = "center";
    quickRow.style.gap = "0.4rem";
    quickRow.style.marginTop = "0.25rem";
    quickRow.style.width = "100%";

    const quickLink = quickRow.createEl("a", { cls: "obsipub-url-link" });
    quickLink.style.color = "var(--text-muted)";
    quickLink.style.textDecoration = "none";
    quickLink.style.flex = "1 1 auto";
    quickLink.style.minWidth = "0";
    quickLink.style.overflowWrap = "anywhere";
    quickLink.setAttribute("target", "_blank");
    quickLink.setAttribute("rel", "noopener");

    const quickCopyBtn = quickRow.createEl("button", { cls: "obsipub-copy-btn" });
    quickCopyBtn.setAttribute("aria-label", t("publishCopyQuickUrl"));
    quickCopyBtn.setAttribute("title", t("publishCopyQuickUrl"));
    quickCopyBtn.style.display = "inline-flex";
    quickCopyBtn.style.alignItems = "center";
    quickCopyBtn.style.justifyContent = "center";
    quickCopyBtn.style.width = "1.55rem";
    quickCopyBtn.style.height = "1.55rem";
    quickCopyBtn.style.minWidth = "1.55rem";
    quickCopyBtn.style.padding = "0.15rem";
    quickCopyBtn.style.border = "1px solid var(--background-modifier-border)";
    quickCopyBtn.style.borderRadius = "0.35rem";
    quickCopyBtn.style.background = "var(--background-secondary)";
    quickCopyBtn.style.color = "var(--text-muted)";
    quickCopyBtn.style.cursor = "pointer";
    quickCopyBtn.style.display = "inline-flex";
    quickCopyBtn.style.alignItems = "center";
    quickCopyBtn.style.justifyContent = "center";
    quickCopyBtn.style.flex = "0 0 auto";
    quickCopyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    quickCopyBtn.disabled = true;

    quickCopyBtn.addEventListener("click", async () => {
      const url = quickAuthPublicationURL(this.serverUrl, prefix, password);
      try {
        await navigator.clipboard.writeText(url);
        new Notice(t("publishQuickCopied"));
      } catch {
        new Notice(t("publishQuickFailedCopy"));
      }
    });

    // Detach link rows so they render after form fields (not before).
    urlRow.remove();
    quickRow.remove();

    const updatePreview = (): void => {
      const url = publicationURL(this.serverUrl, prefix);
      if (prefix === "") {
        urlLink.textContent = url || "(set server URL)";
        urlLink.href = url || "";
      } else {
        urlLink.textContent = url ? url : "(set server URL and prefix)";
        urlLink.href = url || "";
      }
      const quickUrl = quickAuthPublicationURL(this.serverUrl, prefix, password);
      if (password) {
        quickRow.style.display = "flex";
        quickLink.textContent = quickUrl || "";
        quickLink.href = quickUrl || "";
        quickCopyBtn.disabled = false;
      } else {
        quickRow.style.display = "none";
        quickLink.textContent = "";
        quickLink.href = "";
        quickCopyBtn.disabled = true;
      }
    };
    updatePreview();

    let expiryMode: "none" | "relative" | "until" = this.initialExpiresAt ? "until" : "none";
    let ttlValue = "60";
    let untilValue = "";

    const expirySetting = new Setting(contentEl)
      .setName(t("publishExpirationName"))
      .setDesc(t("publishExpirationDesc"))
      .addDropdown((dropdown) => dropdown
        .addOption("none", t("expiryNoExpiry"))
        .addOption("relative", t("expiryRelative"))
        .addOption("until", t("expiryUntil"))
        .setValue(expiryMode)
        .onChange((value) => {
          expiryMode = value as "none" | "relative" | "until";
          ttlRow.style.display = value === "relative" ? "flex" : "none";
          untilRow.style.display = value === "until" ? "flex" : "none";
          validateExpiry();
        }));

    const expiryOptions = contentEl.createDiv({ cls: "obsipub-expiry-options" });
    const ttlRow = expiryOptions.createDiv({ cls: "obsipub-url-row" });
    ttlRow.style.display = "none";
    ttlRow.style.alignItems = "center";
    ttlRow.style.gap = "0.4rem";
    ttlRow.style.marginTop = "0.25rem";
    ttlRow.style.width = "100%";
    const ttlLabel = ttlRow.createEl("label", { text: isRussian() ? "Доступно в течение: " : "Available for: " });
    const ttlInput = ttlRow.createEl("select");
    for (const [seconds, label] of [[60, isRussian() ? "1 минута" : "1 minute"], [300, isRussian() ? "5 минут" : "5 minutes"], [600, isRussian() ? "10 минут" : "10 minutes"], [1800, isRussian() ? "30 минут" : "30 minutes"], [3600, isRussian() ? "1 час" : "1 hour"], [7200, isRussian() ? "2 часа" : "2 hours"], [21600, isRussian() ? "6 часов" : "6 hours"], [43200, isRussian() ? "12 часов" : "12 hours"], [86400, isRussian() ? "24 часа" : "24 hours"]] as const) {
      ttlInput.createEl("option", { value: String(seconds), text: label });
    }
    ttlInput.value = ttlValue;
    ttlInput.style.flex = "1 1 auto";
    ttlInput.addEventListener("input", () => { ttlValue = ttlInput.value; });

    const untilRow = expiryOptions.createDiv({ cls: "obsipub-url-row" });
    untilRow.style.display = "none";
    untilRow.style.alignItems = "center";
    untilRow.style.gap = "0.4rem";
    untilRow.style.marginTop = "0.25rem";
    untilRow.style.width = "100%";
    const untilLabelText = isRussian() ? "Истекает (RFC3339): " : "Expires at (RFC3339): ";
    const untilLabel = untilRow.createEl("label", { text: untilLabelText });
    const untilInput = untilRow.createEl("input", { type: "datetime-local" });
    untilInput.style.flex = "1 1 auto";
    if (this.initialExpiresAt) {
      const initialDate = new Date(this.initialExpiresAt);
      if (!Number.isNaN(initialDate.getTime())) {
        untilInput.value = new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        untilValue = initialDate.toISOString();
        untilRow.style.display = "flex";
      }
    }
    untilInput.addEventListener("input", () => {
      if (!untilInput.value) {
        untilValue = "";
        return;
      }
      const d = new Date(untilInput.value);
      if (isNaN(d.getTime())) {
        untilValue = "";
      } else {
        untilValue = d.toISOString();
      }
      validateExpiry();
    });

    const expiryError = expiryOptions.createEl("small", { text: t("publishExpiryPast") });
    expiryError.style.display = "none";
    expiryError.style.color = "var(--text-error)";
    let publishButton: HTMLButtonElement | null = null;
    const validateExpiry = (): void => {
      const invalid = expiryMode === "until" && !isFutureExpiry(untilValue);
      expiryError.style.display = invalid ? "block" : "none";
      untilInput.style.borderColor = invalid ? "var(--text-error)" : "";
      if (publishButton) publishButton.disabled = invalid;
    };

    const passwordSetting = new Setting(contentEl)
      .setName(t("publishPasswordName"))
      .setDesc(t("publishPasswordDesc"))
      .addText((text) => {
        text.inputEl.type = "password";
        return text.setValue(password).onChange((value) => {
          password = value;
          updatePreview();
        });
      });

    // Order: form fields (prefix, expiry, ttl/until, password), then links.
    urlRow.insertBefore(urlCopyBtn, urlLink);
    quickRow.insertBefore(quickCopyBtn, quickLink);
    contentEl.appendChild(urlRow);
    contentEl.appendChild(quickRow);
    void prefixSetting;
    void passwordSetting;

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = buttons.createEl("button", { text: t("publishCancel") });
    cancel.addEventListener("click", () => this.close());
    const publishBtnText = t("publishBtn");
    const publish = buttons.createEl("button", { text: publishBtnText, cls: "mod-cta" });
    publishButton = publish;
    validateExpiry();
    publish.addEventListener("click", () => {
      if (!isValidPublicationPrefix(prefix)) {
        prefixError.textContent = t("publishPrefixError");
        prefixError.style.display = "block";
        return;
      }
      if (expiryMode === "until" && !untilValue) {
        new Notice(t("publishChooseExpiryDate"));
        return;
      }
      if (this.initialProtected && !resetProtection && !password) {
        new Notice(t("publishPasswordRequired"));
        return;
      }
      this.settled = true;
      const result: PublicationOptions = { prefix, password, showLineNumbers, showArticleLineNumbers, resetProtection };
      if (expiryMode === "relative" && ttlValue) result.ttl = ttlValue;
      if (expiryMode === "until" && untilValue) result.expiresAt = untilValue;
      this.resolveValue(result);
      this.close();
    });
  }

  onClose(): void {
    if (!this.settled) this.resolveValue(undefined);
    this.contentEl.empty();
  }
}

class ObsipubSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ObsipubPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: t("settingsTitle") });
    new Setting(containerEl)
      .setName(t("serverUrlName"))
      .setDesc(t("serverUrlDesc"))
      .addText((text) => text
        .setPlaceholder(t("serverUrlPlaceholder"))
        .setValue(this.plugin.settings.serverUrl)
        .onChange(async (value) => {
          this.plugin.settings.serverUrl = value.trim();
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName(t("apiKeyName"))
      .setDesc(t("apiKeyDesc"))
      .addText((text) => {
        text.inputEl.type = "password";
        return text
          .setPlaceholder(t("apiKeyPlaceholder"))
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName(t("cleanFrontmatterBtn"))
      .setDesc(t("cleanFrontmatterDesc"))
      .addButton((btn) => btn
        .setButtonText(t("cleanFrontmatterBtn"))
        .onClick(async () => {
          await this.plugin.cleanFrontmatter();
        }));
  }
}

class EditExpiryModal extends Modal {
  private readonly serverUrl: string;
  private readonly apiKey: string;
  private readonly prefix: string;
  private readonly initialExpiresAt: number | null;
  private readonly initialTtl: string;
  private readonly onUpdated: () => void;
  private settled = false;

  constructor(app: App, serverUrl: string, apiKey: string, prefix: string, initialExpiresAt: number | null, initialTtl: string, onUpdated: () => void) {
    super(app);
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
    this.prefix = prefix;
    this.initialExpiresAt = initialExpiresAt;
    this.initialTtl = initialTtl;
    this.onUpdated = onUpdated;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: t("editExpiryBtnLabel") });

    let expiryMode: "none" | "relative" | "until" = "none";
    let ttlValue = this.initialTtl || "60";
    let untilValue = "";
    if (this.initialExpiresAt && this.initialExpiresAt > 0) {
      const nowSec = Date.now() / 1000;
      if (this.initialExpiresAt < nowSec + 86400) {
        expiryMode = "relative";
        ttlValue = this.initialTtl || "60";
      } else {
        expiryMode = "until";
      }
      const d = new Date(this.initialExpiresAt * 1000);
      untilValue = d.toISOString().slice(0, 16);
    }

    const form = contentEl.createDiv({ cls: "obsipub-expiry-modal-form" });
    const expiryRow = form.createDiv({ cls: "obsipub-url-row" });
    expiryRow.style.marginTop = "0.5rem";

    const select = expiryRow.createEl("select");
    select.style.flex = "1 1 auto";
    select.style.fontSize = "var(--font-ui-smaller)";
    select.createEl("option", { value: "none", text: t("expiryNoExpiry") });
    select.createEl("option", { value: "relative", text: t("expiryRelative") });
    select.createEl("option", { value: "until", text: t("expiryUntil") });
    select.value = expiryMode;

    const ttlRow = form.createDiv({ cls: "obsipub-url-row" });
    ttlRow.style.display = expiryMode === "relative" ? "flex" : "none";
    ttlRow.style.alignItems = "center";
    ttlRow.style.gap = "0.4rem";
    ttlRow.style.marginTop = "0.25rem";
    ttlRow.style.width = "100%";
    const ttlLabel = ttlRow.createEl("label", { text: isRussian() ? "Доступно в течение: " : "Available for: " });
    const ttlSelect = ttlRow.createEl("select");
    ttlSelect.style.flex = "1 1 auto";
    ttlSelect.style.fontSize = "var(--font-ui-smaller)";
    for (const [seconds, label] of [[60, isRussian() ? "1 минута" : "1 minute"], [300, isRussian() ? "5 минут" : "5 minutes"], [600, isRussian() ? "10 минут" : "10 minutes"], [1800, isRussian() ? "30 минут" : "30 minutes"], [3600, isRussian() ? "1 час" : "1 hour"], [7200, isRussian() ? "2 часа" : "2 hours"], [21600, isRussian() ? "6 часов" : "6 hours"], [43200, isRussian() ? "12 часов" : "12 hours"], [86400, isRussian() ? "24 часа" : "24 hours"]] as const) {
      ttlSelect.createEl("option", { value: String(seconds), text: label });
    }
    ttlSelect.value = ttlValue;

    const untilRow = form.createDiv({ cls: "obsipub-url-row" });
    untilRow.style.display = expiryMode === "until" ? "flex" : "none";
    untilRow.style.alignItems = "center";
    untilRow.style.gap = "0.4rem";
    untilRow.style.marginTop = "0.25rem";
    untilRow.style.width = "100%";
    const untilLabel = untilRow.createEl("label", { text: isRussian() ? "Истекает (RFC3339): " : "Expires at (RFC3339): " });
    const untilInput = untilRow.createEl("input", { type: "datetime-local" });
    untilInput.style.flex = "1 1 auto";
    untilInput.style.fontSize = "var(--font-ui-smaller)";
    if (untilValue) untilInput.value = untilValue;

    select.addEventListener("change", () => {
      const mode = select.value as "none" | "relative" | "until";
      ttlRow.style.display = mode === "relative" ? "flex" : "none";
      untilRow.style.display = mode === "until" ? "flex" : "none";
    });

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    buttons.style.marginTop = "1rem";
    const cancelBtn = buttons.createEl("button", { text: t("publishCancel") });
    cancelBtn.addEventListener("click", () => {
      this.settled = true;
      this.close();
    });
    const applyBtn = buttons.createEl("button", { text: t("updateExpiryBtn"), cls: "mod-cta" });
    applyBtn.addEventListener("click", async () => {
      const mode = select.value as "none" | "relative" | "until";
      let payload: Record<string, unknown> = { prefix: this.prefix };
      if (mode === "none") {
        payload = { ...payload, ttl: null, expiresAt: null };
      } else if (mode === "relative") {
        payload = { ...payload, ttl: ttlSelect.value, expiresAt: null };
      } else if (mode === "until") {
        payload = { ...payload, expiresAt: untilInput.value ? new Date(untilInput.value).toISOString() : null, ttl: null };
      }
      try {
        const endpoint = `${this.serverUrl.replace(/\/+$/, "")}/api/admin/publications/expiry`;
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          new Notice(`${t("expiryUpdateFailed")} (${resp.status}): ${body.slice(0, 100)}`);
        } else {
          new Notice(`${t("expiryUpdated")} ${this.prefix || (isRussian() ? "корень" : "root")}.`);
          this.settled = true;
          this.close();
          this.onUpdated();
        }
      } catch (e) {
        new Notice(`${t("expiryUpdateError")} — ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  onClose(): void {
    if (!this.settled) {
      // Do nothing special; parent handles via open mechanism
    }
    this.contentEl.empty();
  }
}

interface PublicationInfo {
  prefix: string;
  index: string;
  protected: boolean;
  expiresAt: number | null;
}

class ManagePublicationsModal extends Modal {
  private readonly serverUrl: string;
  private readonly apiKey: string;
  private listEl: HTMLElement | null = null;
  private allData: PublicationInfo[] = [];
  private currentPage = 1;
  private readonly itemsPerPage = 20;

  constructor(app: App, serverUrl: string, apiKey: string) {
    super(app);
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
  }

  open(): void {
    super.open();
    this.currentPage = 1;
    this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("managePublicationsTitle") });
    contentEl.createEl("p", { text: t("managePublicationsDesc") });
    this.listEl = contentEl.createDiv({ cls: "obsipub-publication-list" });
    this.listEl.empty();
    const loading = this.listEl.createEl("p", { text: t("loadingPublications") });
    try {
      const url = `${this.serverUrl.replace(/\/+$/, "")}/api/admin/publications`;
      const resp = await fetch(url, {
        headers: { "X-API-Key": this.apiKey }
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Server returned ${resp.status}: ${body.slice(0, 200)}`);
      }
      const data = (await resp.json()) as PublicationInfo[];
      this.allData = data || [];
      loading.remove();
      if (this.allData.length === 0) {
        this.listEl.createEl("p", { text: t("noPublicationsFound") });
        return;
      }

      const totalPages = Math.max(1, Math.ceil(this.allData.length / this.itemsPerPage));
      if (this.currentPage > totalPages) this.currentPage = totalPages;
      if (this.currentPage < 1) this.currentPage = 1;

      // Pagination controls (top)
      const paginationTop = this.listEl.createDiv({ cls: "obsipub-pagination-controls" });
      this.renderPaginationControls(paginationTop, totalPages);

      // Bounded scroll table wrapper
      const scrollWrapper = this.listEl.createDiv({ cls: "obsipub-publication-table-scroll" });
      const table = scrollWrapper.createEl("table", { cls: "obsipub-publication-table" });
      const thead = table.createEl("thead");
      const headerRow = thead.createEl("tr");
      headerRow.createEl("th", { text: t("managePublicationsHeaderPrefix"), cls: "cell-prefix" });
      headerRow.createEl("th", { text: t("managePublicationsHeaderStatus"), cls: "cell-status" });
      headerRow.createEl("th", { text: t("managePublicationsHeaderExpiry"), cls: "cell-expiry" });
      headerRow.createEl("th", { text: t("managePublicationsHeaderActions"), cls: "cell-actions" });
      const tbody = table.createEl("tbody");

      const startIdx = (this.currentPage - 1) * this.itemsPerPage;
      const pageData = this.allData.slice(startIdx, startIdx + this.itemsPerPage);

      for (const pub of pageData) {
        const tr = tbody.createEl("tr");
        const url = publicationURL(this.serverUrl, pub.prefix);
        // Prefix / URL
        const nameCell = tr.createEl("td", { cls: "cell-prefix" });
        const displayPath = pub.prefix === "" ? "/" : `/${pub.prefix}`;
        const link = nameCell.createEl("a", { href: url, text: displayPath, cls: "obsipub-publication-url-link" });
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");

        // Status
        const statusCell = tr.createEl("td", { cls: "cell-status" });
        const statusBadge = statusCell.createEl("span", { cls: `row-status-badge ${pub.protected ? "protected" : "public"}` });
        statusBadge.setAttribute("aria-label", pub.protected ? t("statusProtected") : t("statusPublic"));
        statusBadge.setAttribute("title", pub.protected ? t("statusProtected") : t("statusPublic"));
        statusBadge.textContent = pub.protected ? t("statusProtected") : t("statusPublic");

        // Expiry
        const expiryCell = tr.createEl("td", { cls: "cell-expiry" });
        expiryCell.textContent = pub.expiresAt ? new Date(pub.expiresAt * 1000).toLocaleString() : t("expiryNoExpiry");

        // Actions
        const actionsCell = tr.createEl("td", { cls: "cell-actions" });
        // Edit expiry button
        const editBtn = actionsCell.createEl("button", { cls: "obsipub-publication-action-btn" });
        editBtn.setAttribute("aria-label", t("editExpiryBtnLabel"));
        editBtn.setAttribute("title", t("editExpiryBtnLabel"));
        editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

        editBtn.addEventListener("click", () => {
          const initialTtl = pub.expiresAt && pub.expiresAt > 0 ? (pub.expiresAt < (Date.now() / 1000 + 86400) ? "60" : "86400") : "60";
          new EditExpiryModal(this.app, this.serverUrl, this.apiKey, pub.prefix, pub.expiresAt, initialTtl, () => {
            void this.render();
          }).open();
        });

        // Delete button
        const deleteBtn = actionsCell.createEl("button", { cls: "obsipub-publication-action-btn mod-warning" });
        deleteBtn.setAttribute("aria-label", t("deleteBtnLabel"));
        deleteBtn.setAttribute("title", t("deleteBtnLabel"));
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

        deleteBtn.addEventListener("click", async () => {
          const confirmMsg = isRussian()
            ? `Удалить публикацию ${pub.prefix || "корень"}? ${t("deleteConfirmBody")}`
            : `Delete publication ${pub.prefix || "root"}? ${t("deleteConfirmBody")}`;
          if (!confirm(confirmMsg)) return;
          try {
            const endpoint = `${this.serverUrl.replace(/\/+$/, "")}/api/admin/publications/delete`;
            const resp = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
              body: JSON.stringify({ prefix: pub.prefix })
            });
            if (!resp.ok) {
              const body = await resp.text().catch(() => "");
              new Notice(`${t("deleteFailed")} (${resp.status}): ${body.slice(0, 100)}`);
            } else {
              new Notice(`${t("deleteSuccess")} ${pub.prefix || (isRussian() ? "корень" : "root")}.`);
              await this.render();
            }
          } catch (e) {
            new Notice(`${t("deleteFailed")} — ${e instanceof Error ? e.message : String(e)}`);
          }
        });
      }

      // Pagination controls (bottom)
      const paginationBottom = this.listEl.createDiv({ cls: "obsipub-pagination-controls" });
      paginationBottom.style.marginTop = "0.5rem";
      this.renderPaginationControls(paginationBottom, totalPages);
    } catch (e) {
      loading.remove();
      this.listEl.createEl("p", { text: `${t("failedLoadPublications")} ${e instanceof Error ? e.message : String(e)}`, cls: "obsipub-modal-error" });
    }
  }

  private renderPaginationControls(container: HTMLElement, totalPages: number): void {
    container.empty();
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "space-between";
    container.style.gap = "0.5rem";

    const prevBtn = container.createEl("button", { text: "←", cls: "mod-cta" });
    prevBtn.setAttribute("aria-label", t("paginationPrevious"));
    prevBtn.setAttribute("title", t("paginationPrevious"));
    prevBtn.disabled = this.currentPage <= 1;
    prevBtn.addEventListener("click", () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        void this.render();
      }
    });

    const indicator = container.createEl("span", { text: t("paginationPage").replace("{page}", String(this.currentPage)).replace("{total}", String(totalPages)) });
    indicator.style.fontSize = "var(--font-ui-smaller)";
    indicator.style.color = "var(--text-muted)";

    const nextBtn = container.createEl("button", { text: "→", cls: "mod-cta" });
    nextBtn.setAttribute("aria-label", t("paginationNext"));
    nextBtn.setAttribute("title", t("paginationNext"));
    nextBtn.disabled = this.currentPage >= totalPages;
    nextBtn.addEventListener("click", () => {
      if (this.currentPage < totalPages) {
        this.currentPage++;
        void this.render();
      }
    });
  }
}
