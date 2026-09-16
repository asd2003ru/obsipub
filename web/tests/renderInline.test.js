import assert from 'node:assert/strict'
import test from 'node:test'
import { parseEmphasis, escapeHtml, unescapeMarkdownPunctuation } from '../src/render-inline.js'

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
  assert.equal(unescapeMarkdownPunctuation('1\\.'), '1.')
  assert.equal(unescapeMarkdownPunctuation('Source \\. must show .'), 'Source . must show .')
})

test('preserves path backslashes and code spans', () => {
  assert.equal(unescapeMarkdownPunctuation('C:\\folder'), 'C:\\folder')
  assert.equal(unescapeMarkdownPunctuation('line\\n'), 'line\\n')
})

// Inline emphasis and underline tests

test('bold with double asterisks', () => {
  assert.equal(parseEmphasis('**bold**'), '<strong>bold</strong>')
})

test('bold with double underscores', () => {
  assert.equal(parseEmphasis('__bold__'), '<strong>bold</strong>')
})

test('italic with single asterisk', () => {
  assert.equal(parseEmphasis('*italic*'), '<em>italic</em>')
})

test('italic with single underscore', () => {
  assert.equal(parseEmphasis('_italic_'), '<em>italic</em>')
})

test('strikethrough with double tildes', () => {
  assert.equal(parseEmphasis('~~strikethrough~~'), '<s>strikethrough</s>')
})

test('underline with safe HTML tag', () => {
  assert.equal(parseEmphasis('<u>underlined</u>'), '<u>underlined</u>')
})

test('escaped asterisk remains literal', () => {
  assert.equal(parseEmphasis('a \\* b'), 'a * b')
})

test('escaped underscore remains literal', () => {
  assert.equal(parseEmphasis('x \\_ y'), 'x _ y')
})

test('escaped punctuation does not trigger emphasis', () => {
  assert.equal(parseEmphasis('a \\*b\\* c'), 'a *b* c')
})

test('escaped punctuation still renders visibly inside inline parser', () => {
  assert.equal(parseEmphasis('Source \\. and escaped \\!'), 'Source . and escaped !')
})

test('arbitrary HTML is escaped, only <u> allowed', () => {
  assert.equal(parseEmphasis('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
  assert.equal(parseEmphasis('<b>bold</b>'), '&lt;b&gt;bold&lt;/b&gt;')
})

test('backtick literal preserved and not treated as emphasis trigger', () => {
  assert.equal(parseEmphasis('`text`'), '`text`')
})

test('nested bold and italic with separate markers', () => {
  assert.equal(parseEmphasis('**bold** and *italic*'), '<strong>bold</strong> and <em>italic</em>')
})

test('bold italic with triple markers', () => {
  assert.equal(parseEmphasis('***bold italic***'), '<strong><em>bold italic</em></strong>')
  assert.equal(parseEmphasis('___bold italic___'), '<strong><em>bold italic</em></strong>')
})

test('highlight with double equals', () => {
  assert.equal(parseEmphasis('==marked=='), '<mark>marked</mark>')
  assert.equal(parseEmphasis('==**important**=='), '<mark><strong>important</strong></mark>')
})

test('comments are hidden from rendered inline text', () => {
  assert.equal(parseEmphasis('before %%hidden **text**%% after'), 'before  after')
})

test('underline content can contain emphasis', () => {
  assert.equal(parseEmphasis('<u>**bold underline**</u>'), '<u><strong>bold underline</strong></u>')
})

test('literal text with punctuation is escaped', () => {
  assert.equal(parseEmphasis('a <b> c'), 'a &lt;b&gt; c')
})
