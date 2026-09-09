<script setup>
import { computed, createApp, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExcalidrawEmbed from './components/ExcalidrawEmbed.vue'
import LinkTreeBranch from './components/LinkTreeBranch.vue'
import { calloutIconSvg } from './calloutIcons.js'
import { locale, t } from './i18n.js'
import { isExternalUrl, publicationBasePath, stripPublicationBase, underPublication } from './paths.js'
import { copyableMarkdown, stripFrontMatter } from './markdown-utils.js'

const config = ref({ ready: false, index: '', theme: '', showLineNumbers: false, showArticleLineNumbers: false, fullWidth: false, tree: null })
const auth = ref({ ready: false, protected: false, authenticated: false })
const authPassword = ref('')
const authError = ref('')
const authLoading = ref(false)
const currentPath = ref('')
const markdown = ref('')
const loading = ref(false)
const error = ref(null)
const links = ref({ path: '', name: '', children: [] })
const linksLoading = ref(false)
const linksError = ref(null)
const showRawMarkdown = ref(false)
const copyState = ref('')
const showSearch = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const selectedSearchIndex = ref(-1)
const searchLoading = ref(false)
const searchError = ref(null)
const searchInput = ref(null)
const markdownArticle = ref(null)
const articleRenderVersion = ref(0)
let excalidrawMounts = []
let navigationVersion = 0
const readerWidth = ref(600)
const themeMode = ref('auto') // auto | light | dark
const localFullWidth = ref(false)
const basePath = publicationBasePath(window.location.pathname)
let systemThemeQuery

const breadcrumbs = computed(() => dependencyBreadcrumbs(currentPath.value))
const effectiveFullWidth = computed(() => localFullWidth.value)
const noteTitle = computed(() => breadcrumbs.value.map((item) => item.name).join('/') || currentPath.value || config.value.index || 'index.md')

function extractFrontMatter(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') return null
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---' || lines[i].trim() === '...') {
      return lines.slice(1, i).join('\n')
    }
  }
  return null
}

function parseTitleAndTags(source) {
  const fm = extractFrontMatter(source)
  let title = ''
  let tags = []
  if (fm) {
    for (const line of fm.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('title:')) {
        title = trimmed.slice('title:'.length).trim()
      } else if (trimmed.startsWith('tags:')) {
        const val = trimmed.slice('tags:'.length).trim()
        if (val) {
          if (val.startsWith('[') && val.endsWith(']')) {
            tags = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
          } else {
            tags = [val]
          }
        }
      } else if (tags.length > 0 || (tags.length === 0 && trimmed.startsWith('- '))) {
        if (trimmed.startsWith('- ')) {
          tags.push(trimmed.slice(2).trim())
        }
      }
    }
  }
  return { title, tags }
}

function extractArticleTitle(source) {
  const { title } = parseTitleAndTags(source)
  if (title) return title
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/)
    if (match) return match[1].trim()
  }
  return ''
}

const articleTags = computed(() => parseTitleAndTags(markdown.value).tags)

const articleTitle = computed(() => {
  const fromMarkdown = extractArticleTitle(markdown.value)
  if (fromMarkdown) return fromMarkdown
  const raw = breadcrumbs.value.map((item) => item.name).join('/') || currentPath.value || config.value.index || 'index.md'
  return raw.replace(/\.md$/i, '')
})

watch(locale, (value) => {
  document.documentElement.lang = value
  document.title = articleTitle.value ? `${articleTitle.value} — ObsiPub` : 'ObsiPub'
}, { immediate: true })
watch(articleTitle, (title) => {
  document.title = title ? `${title} — ObsiPub` : 'ObsiPub'
}, { immediate: true })
watch(showSearch, async (opened) => {
  if (!opened) return
  await nextTick()
  searchInput.value?.focus()
})
const rendered = computed(() => { locale.value; return renderMarkdown(stripFrontMatter(markdown.value), currentPath.value) })
const dependencyRoot = computed(() => links.value)
const hasDependencies = computed(() => dependencyRoot.value.children?.length > 0)
const publishedArticlePaths = computed(() => {
  const paths = new Set()
  const visit = (node) => {
    if (!node?.path) return
    paths.add(node.path)
    for (const child of node.children || []) visit(child)
  }
  visit(dependencyRoot.value)
  return paths
})

onMounted(async () => {
  initializeThemeMode()
  await loadAuthStatus()
  if (auth.value.protected && !auth.value.authenticated) return
  await loadPublication()
  window.addEventListener('popstate', () => {
    void openNote(pathFromLocation() || config.value.index || 'index.md', { history: false })
  })
  const onKeyDown = (e) => { if (e.key === 'Escape') showSearch.value = false }
  window.addEventListener('keydown', onKeyDown)
  window.__obsipubKeyListener = onKeyDown
})

watch(articleRenderVersion, () => {
  void mountExcalidrawEmbeds()
}, { flush: 'post' })

onBeforeUnmount(() => {
  unmountExcalidrawEmbeds()
  systemThemeQuery?.removeEventListener?.('change', applyObsidianThemeClass)
  if (window.__obsipubKeyListener) {
    window.removeEventListener('keydown', window.__obsipubKeyListener)
  }
})

async function mountExcalidrawEmbeds() {
  await nextTick()
  unmountExcalidrawEmbeds()
  const placeholders = markdownArticle.value?.querySelectorAll('.excalidraw-placeholder') || []
  excalidrawMounts = Array.from(placeholders, (placeholder) => {
    const app = createApp(ExcalidrawEmbed, {
      src: placeholder.dataset.excalidrawSrc,
      title: placeholder.dataset.excalidrawTitle || t('excalidraw'),
    })
    app.mount(placeholder)
    return { app, placeholder }
  })
}

function unmountExcalidrawEmbeds() {
  for (const { app, placeholder } of excalidrawMounts) app.unmount(placeholder)
  excalidrawMounts = []
}

async function loadAuthStatus() {
  try {
    const response = await fetch(underPublication(basePath, '/api/auth/status'))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    auth.value = {
      ready: Boolean(data.ready ?? data.Ready),
      protected: Boolean(data.protected ?? data.Protected),
      authenticated: Boolean(data.authenticated ?? data.Authenticated),
    }
  } catch (err) {
    auth.value = { ready: false, protected: false, authenticated: false }
    console.warn('Cannot load auth status:', err)
  }
}

async function loadPublication() {
  await loadConfig()
  if (config.value.ready) {
    const initial = pathFromLocation() || config.value.index
    await openNote(initial, { replace: true })
    await loadLinks()
  }
}

async function login() {
  authLoading.value = true
  authError.value = ''
  try {
    const response = await fetch(underPublication(basePath, '/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: authPassword.value }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || data.Error || `HTTP ${response.status}`)
    auth.value = {
      ready: Boolean(data.ready ?? data.Ready ?? true),
      protected: Boolean(data.protected ?? data.Protected ?? true),
      authenticated: Boolean(data.authenticated ?? data.Authenticated ?? true),
    }
    authPassword.value = ''
    await loadPublication()
  } catch (err) {
    authError.value = t('authError', { error: err.message || err })
  } finally {
    authLoading.value = false
  }
}

async function loadConfig() {
  try {
    const response = await fetch(underPublication(basePath, '/api/config'))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    config.value = {
      ready: Boolean(data.ready ?? data.Ready),
      index: data.index || data.Index || '',
      theme: data.theme || data.Theme || '',
      showLineNumbers: Boolean(data.showLineNumbers ?? data.ShowLineNumbers),
      showArticleLineNumbers: Boolean(data.showArticleLineNumbers ?? data.ShowArticleLineNumbers),
      fullWidth: Boolean(data.fullWidth ?? data.FullWidth ?? false),
      tree: data.tree || data.Tree || null,
      ...data,
    }
    if (config.value.ready && config.value.tree) links.value = config.value.tree
    if (config.value.ready && config.value.theme) attachTheme(config.value.theme)
    localFullWidth.value = Boolean(config.value.fullWidth)
  } catch (err) {
    config.value = { ready: false, index: '', theme: '', showLineNumbers: false, showArticleLineNumbers: false, fullWidth: false, tree: null }
    console.warn('Cannot load /api/config:', err)
  }
}

async function openNote(path, options = {}) {
  const requestedPath = normalizeNotePath(path)
  const [nextPath, hash] = requestedPath.split('#')
  const requestVersion = ++navigationVersion
  loading.value = true
  error.value = null

  try {
    const response = await fetch(`${underPublication(basePath, '/api/markdown')}?path=${encodeURIComponent(nextPath)}`)
    const body = await response.text()
    if (!response.ok) throw new Error(body || `HTTP ${response.status}`)
    if (requestVersion !== navigationVersion) return

    unmountExcalidrawEmbeds()
    currentPath.value = nextPath
    showRawMarkdown.value = false
    markdown.value = parseMarkdownResponse(body, response.headers.get('content-type'))
    articleRenderVersion.value += 1
    updateHistory(requestedPath, options)
    if (hash) requestAnimationFrame(() => document.getElementById(slugify(hash))?.scrollIntoView())
  } catch (err) {
    if (requestVersion !== navigationVersion) return
    unmountExcalidrawEmbeds()
    currentPath.value = nextPath
    markdown.value = ''
    articleRenderVersion.value += 1
    error.value = t('openError', { path: nextPath, error: err.message || err })
    updateHistory(requestedPath, options)
  } finally {
    if (requestVersion === navigationVersion) loading.value = false
  }
}

function parseMarkdownResponse(body, contentType = '') {
  if (contentType?.includes('application/json')) {
    try {
      const data = JSON.parse(body)
      return data.markdown ?? data.content ?? data.body ?? ''
    } catch {
      return body
    }
  }
  return body
}

async function copyMarkdown() {
  copyState.value = 'copying'
  try {
    await navigator.clipboard.writeText(copyableMarkdown(markdown.value))
    copyState.value = 'success'
  } catch (err) {
    console.warn('Cannot copy Markdown:', err)
    copyState.value = 'error'
  }
  window.setTimeout(() => { copyState.value = '' }, 1800)
}

function noteRoutePath(path) {
  const [pathPart, hash] = String(path || '').split('#', 2)
  const clean = normalizeNotePath(pathPart).replace(/\.md$/i, '').replace(/\/+$/, '')
  // Root publications use a query route for notes. A path such as /article/
  // is indistinguishable from the /article prefixed publication on the
  // server, and relative SPA assets would also resolve below that path.
  if (!basePath) {
    const query = `/?path=${encodeURIComponent(`${clean}.md`)}`
    return hash ? `${query}#${encodeURIComponent(hash)}` : query
  }
  const route = clean === (config.value.index || 'index.md').replace(/\.md$/i, '') ? '/' : `/${clean.split('/').map(encodeURIComponent).join('/')}/`
  const fullRoute = underPublication(basePath, route)
  return hash ? `${fullRoute}#${encodeURIComponent(hash)}` : fullRoute
}

function updateHistory(path, { history = true, replace = false } = {}) {
  if (!history) return
  const url = new URL(window.location.href)
  const [pathPart, hash] = String(path || '').split('#', 2)
  url.pathname = new URL(noteRoutePath(pathPart), url.origin).pathname
  url.searchParams.delete('path')
  url.hash = hash ? `#${encodeURIComponent(hash)}` : ''
  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({ path }, '', url)
}

function pathFromLocation() {
  const url = new URL(window.location.href)
  const queryPath = url.searchParams.get('path')
  if (queryPath) return url.hash ? `${queryPath}${url.hash}` : queryPath
  const routePath = decodeURIComponent(stripPublicationBase(url.pathname, basePath).replace(/^\/+|\/+$/g, ''))
  if (!routePath) return url.hash ? `${config.value.index || 'index.md'}${url.hash}` : ''
  const notePath = /\.md$/i.test(routePath) ? routePath : `${routePath}.md`
  return url.hash ? `${notePath}${url.hash}` : notePath
}

function attachTheme(name) {
  applyObsidianThemeClass()

  const existing = document.querySelector('link[data-obsipub-theme]')
  if (existing) existing.remove()
  if (!name) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = underPublication(basePath, '/api/theme')
  link.dataset.obsipubTheme = name
  document.head.appendChild(link)
}

function initializeThemeMode() {
  const savedMode = window.localStorage.getItem('obsipub-theme-mode')
  if (['auto', 'light', 'dark'].includes(savedMode)) themeMode.value = savedMode
  systemThemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  systemThemeQuery?.addEventListener?.('change', applyObsidianThemeClass)
  applyObsidianThemeClass()
}

function setThemeMode(mode) {
  if (!['auto', 'light', 'dark'].includes(mode)) return
  themeMode.value = mode
  window.localStorage.setItem('obsipub-theme-mode', mode)
  applyObsidianThemeClass()
}

function applyObsidianThemeClass() {
  const prefersDark = systemThemeQuery?.matches ?? window.matchMedia?.('(prefers-color-scheme: dark)').matches
  document.body.classList.remove('theme-light', 'theme-dark')
  const mode = themeMode.value === 'auto' ? (prefersDark ? 'theme-dark' : 'theme-light') : (themeMode.value === 'dark' ? 'theme-dark' : 'theme-light')
  document.body.classList.add(mode)
}

async function loadLinks() {
  if (config.value.tree) {
    links.value = config.value.tree
    linksLoading.value = false
    linksError.value = null
    return
  }
  linksLoading.value = true
  linksError.value = null
  try {
    const root = config.value.index
    const response = await fetch(`${underPublication(basePath, '/api/links')}?root=${encodeURIComponent(root)}&depth=64`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    links.value = await response.json()
  } catch (err) {
    links.value = { path: '', name: '', children: [] }
    linksError.value = t('treeError', { error: err.message || err })
  } finally {
    linksLoading.value = false
  }
}

function dependencyBreadcrumbs(target) {
  if (!target || !dependencyRoot.value?.path) return []
  return findDependencyPath(dependencyRoot.value, target, []) || []
}

let resizeActive = false

function startResize(event) {
  resizeActive = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function startResizeReader(event) {
  if (event.offsetX > 10) return
  startResize(event)
}

function onResizeMove(event) {
  if (!resizeActive) return
  const workspace = document.querySelector('.workspace')
  if (!workspace) return
  const rect = workspace.getBoundingClientRect()
  const newWidth = Math.min(Math.max(event.clientX - rect.left - 9, 320), 900)
  readerWidth.value = newWidth
}

function onResizeEnd() {
  resizeActive = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

function findDependencyPath(node, target, parents) {
  const next = [...parents, { path: node.path, name: node.name || node.path }]
  if (node.path === target) return next
  for (const child of node.children || []) {
    const result = findDependencyPath(child, target, next)
    if (result) return result
  }
  return null
}

async function searchNotes() {
  const query = searchQuery.value.trim()
  if (!query) {
    searchResults.value = []
    selectedSearchIndex.value = -1
    return
  }
  searchLoading.value = true
  searchError.value = null
  try {
    const response = await fetch(`${underPublication(basePath, '/api/search')}?q=${encodeURIComponent(query)}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    searchResults.value = await response.json()
    selectedSearchIndex.value = searchResults.value.length ? 0 : -1
  } catch (err) {
    searchResults.value = []
    selectedSearchIndex.value = -1
    searchError.value = t('searchError', { error: err.message || err })
  } finally {
    searchLoading.value = false
  }
}

function openSearchResult(path) {
  searchResults.value = []
  selectedSearchIndex.value = -1
  searchQuery.value = ''
  void openNote(path)
}

function onSearchKeydown(event) {
  const count = searchResults.value.length
  if (event.key === 'Escape') {
    showSearch.value = false
    return
  }
  if (!count) return
  if (event.key === 'ArrowDown') {
    selectedSearchIndex.value = Math.min(selectedSearchIndex.value + 1, count - 1)
  } else if (event.key === 'ArrowUp') {
    selectedSearchIndex.value = Math.max(selectedSearchIndex.value - 1, 0)
  } else if (event.key === 'Enter' && selectedSearchIndex.value >= 0) {
    const result = searchResults.value[selectedSearchIndex.value]
    openSearchResult(result.path)
    showSearch.value = false
  }
}

async function onContentClick(event) {
  const copyButton = event.target.closest('button[data-copy-code]')
  if (copyButton) {
    const lines = copyButton.closest('.code-block')?.querySelectorAll('.code-line-text') || []
    const code = Array.from(lines, (line) => line.textContent).join('\n')
    try {
      await navigator.clipboard.writeText(code)
      copyButton.textContent = t('copied')
      copyButton.classList.add('copied')
      window.setTimeout(() => {
        copyButton.textContent = t('copy')
        copyButton.classList.remove('copied')
      }, 1400)
    } catch {
      copyButton.textContent = t('operationError')
    }
    return
  }

  const link = event.target.closest('a[data-note-path]')
  if (!link) return
  event.preventDefault()
  void openNote(link.dataset.notePath)
}

function normalizeNotePath(path) {
  const clean = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '')
  return clean || 'index.md'
}

function resolvePath(target, from = currentPath.value) {
  const rawTarget = String(target || '').replace(/\\/g, '/')
  const isRootRelative = rawTarget.startsWith('/')
  const cleanTarget = normalizeNotePath(rawTarget)
  if (!from || isRootRelative) return cleanTarget

  // Match the graph copier: every local reference is relative to its note.
  const base = from.split('/').slice(0, -1)
  for (const part of cleanTarget.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') base.pop()
    else base.push(part)
  }
  return base.join('/')
}

function noteTarget(target, from) {
  const [pathPart, heading] = String(target).split('#')
  let resolved = resolvePath(pathPart || '', from)
  if (resolved && !/\.[^/.]+$/.test(resolved)) resolved += '.md'

  // Obsidian resolves a bare [[Note]] vault-wide when the name is unique.
  // The archive preserves its vault paths, so map that link through the
  // manifest tree instead of assuming it lives beside the current note.
  const raw = String(pathPart || '').replace(/\\/g, '/').trim()
  if (raw && !raw.includes('/') && !raw.startsWith('.') && !publishedArticlePaths.value.has(resolved)) {
    const basename = raw.toLowerCase().endsWith('.md') ? raw.toLowerCase() : `${raw.toLowerCase()}.md`
    const matches = [...publishedArticlePaths.value].filter((path) => path.split('/').pop().toLowerCase() === basename)
    if (matches.length === 1) resolved = matches[0]
  }
  return heading ? `${resolved}#${heading}` : resolved
}

function rawUrl(target, from) {
  const path = String(target).split('#')[0]
  return `${underPublication(basePath, '/api/raw')}?path=${encodeURIComponent(path)}&from=${encodeURIComponent(from || '')}`
}

function isExcalidrawTarget(target) {
  return /\.excalidraw(?:\.md)?(?:#.*)?$/i.test(String(target).trim())
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#96;')
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function calloutIcon(type) {
  return `<span class="svg-icon svg-callout-icon">${calloutIconSvg(type)}</span>`
}

function codeLanguage(lang = '') {
  const key = String(lang).trim().toLowerCase().split(/\s+/)[0]
  const languages = {
    bash: ['bash', 'Bash'], shell: ['bash', 'Bash'], sh: ['bash', 'Bash'], zsh: ['zsh', 'Zsh'], fish: ['fish', 'Fish'], console: ['console', 'Console'], terminal: ['console', 'Console'],
    c: ['c', 'C'], cpp: ['cpp', 'C++'], 'c++': ['cpp', 'C++'], csharp: ['cs', 'C#'], cs: ['cs', 'C#'],
    css: ['css', 'CSS'], scss: ['scss', 'SCSS'], sass: ['sass', 'Sass'], less: ['less', 'Less'], stylus: ['stylus', 'Stylus'],
    dockerfile: ['docker', 'Docker'], docker: ['docker', 'Docker'],
    go: ['go', 'Go'], golang: ['go', 'Go'], rust: ['rust', 'Rust'], rs: ['rust', 'Rust'],
    html: ['html', 'HTML'], xml: ['html', 'HTML'], svg: ['html', 'HTML'], vue: ['vue', 'Vue'], react: ['react', 'React'], jsx: ['react', 'React'], svelte: ['vue', 'Svelte'],
    java: ['java', 'Java'], javascript: ['js', 'JavaScript'], js: ['js', 'JavaScript'], jsx: ['react', 'React'], typescript: ['ts', 'TypeScript'], ts: ['ts', 'TypeScript'], tsx: ['react', 'React'],
    json: ['json', 'JSON'], json5: ['json', 'JSON5'], yaml: ['yaml', 'YAML'], yml: ['yaml', 'YAML'], toml: ['toml', 'TOML'], ini: ['ini', 'INI'], cfg: ['ini', 'CFG'], conf: ['ini', 'CONF'],
    kotlin: ['kotlin', 'Kotlin'], kt: ['kotlin', 'Kotlin'], scala: ['scala', 'Scala'],
    lua: ['lua', 'Lua'], markdown: ['md', 'Markdown'], md: ['md', 'Markdown'], text: ['code', 'Text'], txt: ['code', 'Text'], plaintext: ['code', 'Text'], none: ['code', 'Code'],
    nginx: ['nginx', 'Nginx'], apache: ['apache', 'Apache'], lighttpd: ['nginx', 'Lighttpd'],
    php: ['php', 'PHP'], powershell: ['powershell', 'PowerShell'], ps1: ['powershell', 'PowerShell'], pwsh: ['powershell', 'PowerShell'],
    python: ['python', 'Python'], py: ['python', 'Python'], 'python3': ['python', 'Python3'], 'python-repl': ['python', 'Python'], ipython: ['python', 'IPython'],
    r: ['r', 'R'], ruby: ['ruby', 'Ruby'], rb: ['ruby', 'Ruby'], perl: ['perl', 'Perl'], pl: ['perl', 'Perl'],
    sql: ['sql', 'SQL'], postgresql: ['sql', 'PostgreSQL'], mysql: ['sql', 'MySQL'], sqlite: ['sql', 'SQLite'], mssql: ['sql', 'MSSQL'],
    swift: ['swift', 'Swift'], swiftui: ['swift', 'SwiftUI'],
    git: ['git', 'Git'], diff: ['diff', 'Diff'], patch: ['diff', 'Patch'],
    graphql: ['graphql', 'GraphQL'], gql: ['graphql', 'GraphQL'], proto: ['proto', 'Proto'], protobuf: ['proto', 'Proto'], thrift: ['thrift', 'Thrift'], avro: ['avro', 'Avro'],
    gradle: ['gradle', 'Gradle'], maven: ['maven', 'Maven'], sbt: ['scala', 'SBT'],
    matlab: ['matlab', 'MATLAB'], julia: ['julia', 'Julia'], dart: ['dart', 'Dart'],
    batch: ['batch', 'Batch'], cmd: ['batch', 'CMD'],
    xml: ['html', 'XML'],
  }
  const [icon, name] = languages[key] || ['code', key ? key.toUpperCase() : 'Code']
  return { key: icon, name, glyph: icon === 'code' ? '</>' : icon.toUpperCase() }
}

function renderCodeBlock(code, lang = '') {
  const language = lang ? ` data-language="${escapeAttr(lang)}"` : ''
  const lineNumberClass = config.value.showLineNumbers ? ' with-line-numbers' : ''
  const codeType = codeLanguage(lang)
  const lines = String(code).split('\n')
  const renderedLines = lines
    .map((line) => `<span class="code-line"><span class="code-line-text">${escapeHtml(line) || ' '}</span></span>`)
    .join('')
  const languageIcon = `<span class="code-language-icon language-${escapeAttr(codeType.key)}" title="${escapeAttr(codeType.name)}" aria-label="${escapeAttr(codeType.name)}">${escapeHtml(codeType.glyph)}</span>`
  return `<div class="code-block${lineNumberClass}"${language}>${languageIcon}<button class="copy-code-button" type="button" data-copy-code aria-label="${escapeAttr(t('copy'))}" title="${escapeAttr(t('copy'))}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><div class="code-block-inner"><pre><code class="language-${escapeAttr(lang)}">${renderedLines}</code></pre></div></div>`
}

function articleBlock(html, sourceLine) {
  if (!config.value.showArticleLineNumbers || !sourceLine) return html
  return `<div class="article-line-block" data-source-line="${sourceLine}">${html}</div>`
}

function splitTableRow(line) {
  let source = String(line).trim()
  if (source.startsWith('|')) source = source.slice(1)
  if (source.endsWith('|')) source = source.slice(0, -1)

  const cells = []
  let cell = ''
  let escaped = false
  for (const character of source) {
    if (escaped) {
      cell += character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
  }
  cells.push(cell.trim())
  return cells
}

function tableAlignment(cell) {
  const value = cell.trim()
  if (value.startsWith(':') && value.endsWith(':')) return 'center'
  if (value.endsWith(':')) return 'right'
  return 'left'
}

function isTableDivider(line) {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function renderTable(header, divider, rows, fromPath) {
  const alignments = divider.map(tableAlignment)
  const renderCells = (cells, tag) => header.map((_, index) => {
    const alignment = alignments[index] || 'left'
    return `<${tag} style="text-align:${alignment}">${renderInline(cells[index] || '', fromPath)}</${tag}>`
  }).join('')
  const head = `<thead><tr>${renderCells(header, 'th')}</tr></thead>`
  const body = rows.map((row) => `<tr>${renderCells(row, 'td')}</tr>`).join('')
  return `<div class="markdown-table-wrap"><table>${head}<tbody>${body}</tbody></table></div>`
}

function renderMarkdown(source, fromPath) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
  const html = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const sourceLine = i + 1

    if (!line.trim()) {
      i += 1
      continue
    }

    const fence = line.match(/^```(.*)$/)
    if (fence) {
      const lang = fence[1].trim()
      const code = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++])
      if (i < lines.length) i += 1
      html.push(articleBlock(renderCodeBlock(code.join('\n'), lang), sourceLine))
      continue
    }

    const callout = line.match(/^\s*>\s*\[!\s*(\w+)\]([+-])?\s*(.*)$/i)
    if (callout) {
      const type = callout[1].toLowerCase()
      const title = (callout[3] || type).replace(/^\*\*(.+)\*\*$/, '$1')
      const body = []
      i += 1
      while (i < lines.length && /^\s*> ?/.test(lines[i])) body.push(lines[i++].replace(/^\s*> ?/, ''))
      html.push(articleBlock(`<div class="callout" data-callout="${escapeAttr(type)}"><div class="callout-title"><div class="callout-icon">${calloutIcon(type)}</div><div class="callout-title-inner">${renderInline(title, fromPath)}</div></div><div class="callout-content">${renderMarkdown(body.join('\n'), fromPath)}</div></div>`, sourceLine))
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = splitTableRow(line)
      const divider = splitTableRow(lines[i + 1])
      const rows = []
      i += 2
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitTableRow(lines[i++]))
      html.push(articleBlock(renderTable(header, divider, rows, fromPath), sourceLine))
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const text = unescapeMarkdownPunctuation(heading[2].replace(/\s+#+$/, ''))
      html.push(articleBlock(`<h${level} id="${escapeAttr(slugify(text))}">${renderInline(text, fromPath)}</h${level}>`, sourceLine))
      i += 1
      continue
    }

    if (/^[-*+]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) items.push(`<li>${renderInline(lines[i++].replace(/^[-*+]\s+/, ''), fromPath)}</li>`)
      html.push(articleBlock(`<ul>${items.join('')}</ul>`, sourceLine))
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(`<li>${renderInline(lines[i++].replace(/^\d+\.\s+/, ''), fromPath)}</li>`)
      html.push(articleBlock(`<ol>${items.join('')}</ol>`, sourceLine))
      continue
    }

    if (/^>\s?/.test(line) && !line.match(/^\s*>\s*\[!/i)) {
      const quote = []
      while (i < lines.length && /^>\s?/.test(lines[i]) && !lines[i].match(/^\s*>\s*\[!/i)) quote.push(lines[i++].replace(/^>\s?/, ''))
      html.push(articleBlock(`<blockquote>${renderMarkdown(quote.join('\n'), fromPath)}</blockquote>`, sourceLine))
      continue
    }

    const paragraph = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s*\[!\w+\]/i.test(lines[i]) &&
      !/^[-*+]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i++])
    }
    html.push(articleBlock(`<p>${renderInline(paragraph.join('\n'), fromPath).replaceAll('\n', '<br>')}</p>`, sourceLine))
  }

  return html.join('\n')
}

function unescapeMarkdownPunctuation(text) {
  return String(text).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1')
}

function renderInline(text, fromPath) {
  const tokenRe = /(`[^`]+`|!\[([^\]]*)\]\(([^)]+)\)|\[((?:[^!\[\]]|!\[\[[^\]]+\]\])+?)\]\(([^)]+)\)|!\[\[([^\]]+)\]\]|\[\[([^\]|]+)(?:\|([^\]]+))?\]\])/g
  let result = ''
  let last = 0
  let match

  while ((match = tokenRe.exec(text))) {
    result += escapeHtml(unescapeMarkdownPunctuation(text.slice(last, match.index)))
    const [raw] = match

    if (raw.startsWith('`')) {
      result += `<code>${escapeHtml(raw.slice(1, -1))}</code>`
    } else if (match[2] !== undefined) {
      const alt = match[2]
      const src = match[3].trim()
      result += isExternalUrl(src)
        ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`
        : `<img src="${escapeAttr(rawUrl(src, fromPath))}" alt="${escapeAttr(alt)}">`
    } else if (match[4] !== undefined) {
      const label = match[4]
      const href = match[5].trim()
      if (isExternalUrl(href)) {
        result += `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer">${renderInline(label, fromPath)}</a>`
      } else if (/\.md(?:#.*)?$/i.test(href) || !/\.[^/.#]+(?:#.*)?$/.test(href)) {
        const target = noteTarget(href, fromPath)
        result += `<a href="${escapeAttr(noteRoutePath(target))}" data-note-path="${escapeAttr(target)}">${renderInline(label, fromPath)}</a>`
      } else {
        result += `<a href="${escapeAttr(rawUrl(href, fromPath))}">${renderInline(label, fromPath)}</a>`
      }
    } else if (match[6] !== undefined) {
      const target = match[6].trim()
      const source = target.split('|', 1)[0].trim()
      if (isExcalidrawTarget(source)) {
        result += `<span class="excalidraw-placeholder" data-excalidraw-src="${escapeAttr(rawUrl(source, fromPath))}" data-excalidraw-title="${escapeAttr(source)}"></span>`
      } else {
        result += `<img class="embed" src="${escapeAttr(rawUrl(source, fromPath))}" alt="${escapeAttr(target)}">`
      }
    } else if (match[7] !== undefined) {
      const target = noteTarget(match[7].trim(), fromPath)
      const label = match[8] || match[7]
      result += `<a href="${escapeAttr(noteRoutePath(target))}" data-note-path="${escapeAttr(target)}">${escapeHtml(label)}</a>`
    }

    last = match.index + raw.length
  }

  result += escapeHtml(unescapeMarkdownPunctuation(text.slice(last)))
  return result
}
</script>

<template>
  <main class="app-shell">
    <section v-if="auth.protected && !auth.authenticated" class="auth-publication" role="dialog" aria-labelledby="auth-title">
      <form class="auth-card" @submit.prevent="login">
        <h1 id="auth-title">{{ t('authTitle') }}</h1>
        <p>{{ t('authText') }}</p>
        <input v-model="authPassword" type="password" :placeholder="t('authPassword')" :aria-label="t('authPassword')" autocomplete="current-password" autofocus>
        <p v-if="authError" class="error-text" role="alert">{{ authError }}</p>
        <button type="submit" :disabled="authLoading || !authPassword">{{ authLoading ? t('loading') : t('authSubmit') }}</button>
      </form>
    </section>
    <section v-else-if="!config.ready" class="empty-publication" role="status">
      <h1>{{ t('emptyTitle') }}</h1>
      <p>{{ t('emptyText') }}</p>
    </section>
    <template v-else>
    <header class="topbar">
      <button class="home-link" type="button" :aria-label="t('homeAria')" :title="t('home')" @click="openNote(config.index || 'index.md')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
      </button>
      <nav class="breadcrumbs" :aria-label="t('notePath')">
        <template v-if="breadcrumbs.length">
          <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
            <span v-if="index" class="breadcrumb-separator" aria-hidden="true">/</span>
            <button v-if="index < breadcrumbs.length - 1" type="button" class="breadcrumb-link" @click="openNote(crumb.path)">{{ crumb.name }}</button>
            <span v-else class="breadcrumb-current" aria-current="page">{{ crumb.name }}</span>
          </template>
        </template>
        <span v-else class="breadcrumb-current" aria-current="page">{{ currentPath || config.index }}</span>
      </nav>
      <button class="search-icon-btn" type="button" :aria-label="t('search')" :title="t('search')" @click="showSearch = true">⌕</button>
      <div class="theme-switcher" role="group" :aria-label="t('theme')">
        <button type="button" :class="{ active: themeMode === 'auto' }" :aria-pressed="themeMode === 'auto'" :title="t('auto')" @click="setThemeMode('auto')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M12 7v7M9.5 9.5a3.5 3.5 0 1 0 5 0"/></svg><span>{{ t('auto') }}</span>
        </button>
        <button type="button" :class="{ active: themeMode === 'light' }" :aria-pressed="themeMode === 'light'" :title="t('light')" @click="setThemeMode('light')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg><span>{{ t('light') }}</span>
        </button>
        <button type="button" :class="{ active: themeMode === 'dark' }" :aria-pressed="themeMode === 'dark'" :title="t('dark')" @click="setThemeMode('dark')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5z"/></svg><span>{{ t('dark') }}</span>
        </button>
      </div>
    </header>

    <div class="workspace">
      <aside class="file-panel" :aria-label="t('notesTree')">
        <div class="file-panel-header">
          <strong>{{ t('contents') }}</strong>
          <button type="button" :title="t('refreshTree')" @click="loadLinks">↻</button>
        </div>
        <div v-if="linksLoading" class="tree-state">{{ t('loading') }}</div>
        <div v-else-if="linksError" class="tree-state error-text">{{ linksError }}</div>
        <nav v-else class="links-tree" :aria-label="t('dependencyTree')">
          <button type="button" class="dependency-root" :title="dependencyRoot.path" @click="openNote(dependencyRoot.path || config.index)">
            <span>{{ dependencyRoot.name || noteTitle }}</span>
          </button>
          <LinkTreeBranch v-if="hasDependencies" :nodes="dependencyRoot.children" :current-path="currentPath" @open="openNote" />
        </nav>
      </aside>
      <section class="reader" :style="{ minWidth: readerWidth + 'px' }" @mousedown="startResizeReader">
        <section v-if="error" class="error" role="alert">
          <strong>{{ t('error') }}</strong>
          <p>{{ error }}</p>
          <button type="button" @click="openNote(config.index || 'index.md')">{{ t('openIndex') }}</button>
        </section>

        <section class="content-card" :class="{ muted: loading }">
          <button
            class="raw-toggle"
            type="button"
            :class="{ active: showRawMarkdown }"
            :aria-label="showRawMarkdown ? t('showDocument') : t('showSource')"
            :title="showRawMarkdown ? t('showDocument') : t('showSource')"
            @click="showRawMarkdown = !showRawMarkdown"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></svg>
          </button>
          <button class="copy-markdown-btn" type="button" :aria-label="t('copyMarkdown')" :title="t('copyMarkdown')" @click="copyMarkdown">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9v1" /></svg>
          </button>
          <button class="full-width-btn" type="button" :class="{ active: effectiveFullWidth }" :aria-label="effectiveFullWidth ? t('fullWidthOff') : t('fullWidthOn')" :title="effectiveFullWidth ? t('fullWidthOff') : t('fullWidthOn')" @click="localFullWidth = !localFullWidth">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="6" y="15" width="12" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <span v-if="copyState === 'success'" class="copy-status" role="status">{{ t('copied') }}</span>
          <span v-else-if="copyState === 'error'" class="copy-status error-text" role="alert">{{ t('copyFailed') }}</span>
          <div v-if="loading" class="loading" role="status">{{ t('loading') }}</div>
          <pre v-if="showRawMarkdown" class="raw-markdown" :class="{ 'full-width': effectiveFullWidth }"><code>{{ markdown }}</code></pre>
          <article v-show="!showRawMarkdown" ref="markdownArticle" class="markdown-body markdown-preview-view markdown-rendered" :class="{ 'with-article-line-numbers': config.showArticleLineNumbers, 'full-width': effectiveFullWidth }" v-html="rendered" @click="onContentClick"></article>
        </section>
      </section>
    </div>
    <div v-if="showSearch" class="search-overlay" @click.self="showSearch = false">
      <div class="search-modal">
        <div class="search-modal-input-wrap">
          <input ref="searchInput" v-model="searchQuery" type="search" :placeholder="t('search')" :aria-label="t('search')" @input="searchNotes" @keydown.down.prevent="onSearchKeydown" @keydown.up.prevent="onSearchKeydown" @keydown.enter.prevent="onSearchKeydown" @keydown.esc.prevent="onSearchKeydown" autofocus>
        </div>
        <div v-if="searchLoading || searchError || searchResults.length" class="search-modal-results">
          <div v-if="searchLoading" class="search-state">{{ t('searchLoading') }}</div>
          <div v-else-if="searchError" class="search-state error-text">{{ searchError }}</div>
          <button v-for="(result, index) in searchResults" :key="result.path" type="button" :class="{ active: index === selectedSearchIndex }" @mouseenter="selectedSearchIndex = index" @click="openSearchResult(result.path); showSearch = false;">
            <span>{{ result.name }}</span><small>{{ result.path }}</small>
            <span v-if="result.tags && result.tags.length" class="search-tags" style="display: flex; gap: 4px; margin-top: 2px; flex-wrap: wrap;">
              <span v-for="tag in result.tags" :key="tag" class="tag-badge" style="font-size: 0.65rem; padding: 0.1em 0.4em;">{{ tag }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
    </template>
  </main>
</template>
