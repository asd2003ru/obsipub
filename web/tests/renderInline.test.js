import assert from 'node:assert/strict'
import test from 'node:test'

function unescapeMarkdownPunctuation(text) {
  return String(text).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

test('strips backslash before Markdown punctuation', () => {
  assert.equal(unescapeMarkdownPunctuation('a \\. b'), 'a . b')
  assert.equal(unescapeMarkdownPunctuation('test\\!'), 'test!')
  assert.equal(unescapeMarkdownPunctuation('a\\*b'), 'a*b')
  assert.equal(unescapeMarkdownPunctuation('x\\_y'), 'x_y')
  assert.equal(unescapeMarkdownPunctuation('C\\:folder'), 'C:folder')
})

test('preserves backslash before non-punctuation', () => {
  assert.equal(unescapeMarkdownPunctuation('C:\\folder'), 'C:\\folder')
  assert.equal(unescapeMarkdownPunctuation('line\\n'), 'line\\n')
  assert.equal(unescapeMarkdownPunctuation('a\\b'), 'a\\b')
})

test('preserves HTML escaping for unescaped text', () => {
  assert.equal(escapeHtml(unescapeMarkdownPunctuation('a <b>')), 'a &lt;b&gt;')
})

test('renders escaped punctuation visibly', () => {
  const input = 'Source \\. must show .'
  const unescaped = unescapeMarkdownPunctuation(input)
  assert.equal(unescaped, 'Source . must show .')
})

test('heading escaped punctuation renders visibly', () => {
  // Source heading text: #### 1\. must render visibly as 1-dot.
  assert.equal(unescapeMarkdownPunctuation('1\\.'), '1.')
  assert.equal(unescapeMarkdownPunctuation('Source \\. must show .'), 'Source . must show .')
})

test('preserves path backslashes and code spans', () => {
  assert.equal(unescapeMarkdownPunctuation('C:\\folder'), 'C:\\folder')
  assert.equal(unescapeMarkdownPunctuation('line\\n'), 'line\\n')
})
