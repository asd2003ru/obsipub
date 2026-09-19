import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeLanguage,
  isSupportedLanguage,
  highlightBlockSource,
  renderHighlightedLines,
  escapeHtml,
} from '../src/highlighting.js'

test('normalizeLanguage maps common names', () => {
  assert.equal(normalizeLanguage('json'), 'json')
  assert.equal(normalizeLanguage('JSON'), 'json')
  assert.equal(normalizeLanguage('js'), 'javascript')
  assert.equal(normalizeLanguage('javascript'), 'javascript')
  assert.equal(normalizeLanguage('typescript'), 'typescript')
  assert.equal(normalizeLanguage('ts'), 'typescript')
  assert.equal(normalizeLanguage('python'), 'python')
  assert.equal(normalizeLanguage('py'), 'python')
  assert.equal(normalizeLanguage('bash'), 'bash')
  assert.equal(normalizeLanguage('shell'), 'bash')
  assert.equal(normalizeLanguage('sh'), 'bash')
  assert.equal(normalizeLanguage('go'), 'go')
  assert.equal(normalizeLanguage('golang'), 'go')
  assert.equal(normalizeLanguage('java'), 'java')
  assert.equal(normalizeLanguage('css'), 'css')
  assert.equal(normalizeLanguage('html'), 'xml')
  assert.equal(normalizeLanguage('markdown'), 'markdown')
  assert.equal(normalizeLanguage('md'), 'markdown')
  assert.equal(normalizeLanguage('rust'), 'rust')
  assert.equal(normalizeLanguage('rs'), 'rust')
  assert.equal(normalizeLanguage('sql'), 'sql')
  assert.equal(normalizeLanguage('yaml'), 'yaml')
  assert.equal(normalizeLanguage('yml'), 'yaml')
  assert.equal(normalizeLanguage('c'), 'c')
  assert.equal(normalizeLanguage('cpp'), 'cpp')
  assert.equal(normalizeLanguage('c++'), 'cpp')
  assert.equal(normalizeLanguage('csharp'), 'csharp')
  assert.equal(normalizeLanguage('cs'), 'csharp')
})

test('isSupportedLanguage returns true for supported, false for unknown/empty', () => {
  assert.equal(isSupportedLanguage('json'), true)
  assert.equal(isSupportedLanguage('unknown-language-xyz'), false)
  assert.equal(isSupportedLanguage(''), false)
  assert.equal(isSupportedLanguage('plaintext'), false)
})

test('highlightBlockSource highlights JSON and preserves structure for line split', () => {
  const result = highlightBlockSource('{"a": 1}', 'json')
  assert.equal(result.highlighted, true)
  assert.ok(typeof result.html === 'string')
  assert.ok(result.html.includes('hljs'))
})

test('highlightBlockSource returns null html for unknown language', () => {
  const result = highlightBlockSource('hello', 'unknown-language')
  assert.equal(result.highlighted, false)
  assert.equal(result.html, null)
})

test('highlightBlockSource returns null html for empty/no language', () => {
  const result = highlightBlockSource('hello', '')
  assert.equal(result.highlighted, false)
  assert.equal(result.html, null)
})

test('highlightBlockSource safely escapes and highlights JSON', () => {
  const result = highlightBlockSource('{"name": "test"}', 'json')
  assert.equal(result.highlighted, true)
  assert.ok(!result.html.includes('<script'))
  assert.ok(result.html.includes('hljs-attr') || result.html.includes('hljs-string'))
})

test('renderHighlightedLines preserves line wrappers and newlines', () => {
  const result = renderHighlightedLines('def foo():\n    return 1', 'python')
  assert.ok(result.includes('<span class="code-line">'))
  assert.ok(result.includes('<span class="code-line-text">'))
  assert.ok(result.includes('>def<'))
  assert.ok(result.includes('>return<'))
  assert.ok(result.includes('>1<'))
})

test('renderHighlightedLines keeps token markup within each line', () => {
  const result = renderHighlightedLines('/* first\nsecond */', 'javascript')
  assert.equal((result.match(/class="code-line"/g) || []).length, 2)
  assert.equal((result.match(/<span/g) || []).length, (result.match(/<\/span>/g) || []).length)
})

test('escapeHtml converts special chars', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;')
  assert.equal(escapeHtml('a & b'), 'a &amp; b')
  assert.equal(escapeHtml('"quoted"'), '&quot;quoted&quot;')
})
