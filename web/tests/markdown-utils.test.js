import assert from 'node:assert/strict'
import test from 'node:test'
import { copyableMarkdown, stripFrontMatter } from '../src/markdown-utils.js'

test('stripFrontMatter removes YAML frontmatter and preserves body', () => {
  assert.equal(stripFrontMatter('---\ntitle: Secret\n---\n# Article\n'), '# Article\n')
  assert.equal(stripFrontMatter('...\n# Article'), '...\n# Article')
})

test('copyableMarkdown keeps Markdown body without metadata', () => {
  assert.equal(copyableMarkdown('---\ntags: [private]\n---\nText'), 'Text')
  assert.equal(copyableMarkdown('# Plain'), '# Plain')
})
