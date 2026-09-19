import hljs from 'highlight.js/lib/core'

import jsonLang from 'highlight.js/lib/languages/json'
import javascriptLang from 'highlight.js/lib/languages/javascript'
import typescriptLang from 'highlight.js/lib/languages/typescript'
import pythonLang from 'highlight.js/lib/languages/python'
import bashLang from 'highlight.js/lib/languages/bash'
import goLang from 'highlight.js/lib/languages/go'
import javaLang from 'highlight.js/lib/languages/java'
import cssLang from 'highlight.js/lib/languages/css'
import xmlLang from 'highlight.js/lib/languages/xml'
import markdownLang from 'highlight.js/lib/languages/markdown'
import rustLang from 'highlight.js/lib/languages/rust'
import sqlLang from 'highlight.js/lib/languages/sql'
import yamlLang from 'highlight.js/lib/languages/yaml'
import cLang from 'highlight.js/lib/languages/c'
import cppLang from 'highlight.js/lib/languages/cpp'
import csharpLang from 'highlight.js/lib/languages/csharp'

const LANGUAGE_DEFS = {
  json: jsonLang,
  javascript: javascriptLang,
  typescript: typescriptLang,
  python: pythonLang,
  bash: bashLang,
  sh: bashLang,
  zsh: bashLang,
  shell: bashLang,
  go: goLang,
  golang: goLang,
  java: javaLang,
  css: cssLang,
  html: xmlLang,
  xml: xmlLang,
  svg: xmlLang,
  vue: xmlLang,
  react: xmlLang,
  markdown: markdownLang,
  md: markdownLang,
  rust: rustLang,
  rs: rustLang,
  sql: sqlLang,
  yaml: yamlLang,
  yml: yamlLang,
  c: cLang,
  cpp: cppLang,
  'c++': cppLang,
  csharp: csharpLang,
  cs: csharpLang,
}

const LANGUAGE_ALIASES = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', python3: 'python', sh: 'bash', shell: 'bash', zsh: 'bash',
  golang: 'go', html: 'xml', svg: 'xml', vue: 'xml', react: 'xml',
  md: 'markdown', rs: 'rust', yml: 'yaml', 'c++': 'cpp', cs: 'csharp',
}

export function registerSupportedLanguages() {
  for (const [name, def] of Object.entries(LANGUAGE_DEFS)) {
    hljs.registerLanguage(name, def)
  }
}

registerSupportedLanguages()

export function normalizeLanguage(rawLang = '') {
  const cleaned = String(rawLang).trim().toLowerCase().split(/\s+/)[0]
  if (!cleaned) return null
  const normalized = LANGUAGE_ALIASES[cleaned] || cleaned
  return Object.hasOwn(LANGUAGE_DEFS, normalized) ? normalized : null
}

export function isSupportedLanguage(rawLang = '') {
  return normalizeLanguage(rawLang) !== null
}

export function highlightBlockSource(code, lang = '') {
  const langKey = normalizeLanguage(lang)
  if (!langKey) {
    return { highlighted: false, html: null }
  }

  const result = hljs.highlight(String(code || ''), {
    language: langKey,
    ignoreIllegals: true,
  })

  return { highlighted: true, html: result.value }
}

export function renderHighlightedLines(code, lang = '') {
  const language = normalizeLanguage(lang)
  if (!language) return null

  // Highlight each line independently so token spans never cross the existing
  // line wrapper boundary and create invalid markup.
  return String(code).split('\n')
    .map((line) => {
      const inner = line
        ? hljs.highlight(line, { language, ignoreIllegals: true }).value
        : ' '
      return `<span class="code-line"><span class="code-line-text">${inner}</span></span>`
    })
    .join('')
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
