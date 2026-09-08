import assert from 'node:assert/strict'
import test from 'node:test'
import { isExternalUrl, publicationBasePath, stripPublicationBase, underPublication } from '../src/paths.js'

test('derives a publication prefix from the current pathname', () => {
  assert.equal(publicationBasePath('/docs/'), '/docs')
  assert.equal(publicationBasePath('/docs/articles/start/'), '/docs')
  assert.equal(publicationBasePath('/'), '')
  assert.equal(publicationBasePath('/index.html'), '')
})

test('derives base from nested paths and ignores query/hash', () => {
  assert.equal(publicationBasePath('/docs/articles/start/', ''), '/docs')
  assert.equal(publicationBasePath('/docs?foo=bar', ''), '/docs')
  assert.equal(publicationBasePath('/docs#section', ''), '/docs')
  assert.equal(publicationBasePath('/docs/articles/?x=1#y', ''), '/docs')
  assert.equal(publicationBasePath('/', ''), '')
  assert.equal(publicationBasePath('/index.html', ''), '')
})

test('handles explicit prefix including encoded segments', () => {
  assert.equal(publicationBasePath('', 'my-prefix'), '/my-prefix')
  assert.equal(publicationBasePath('', 'hello world'), '/hello%20world')
  assert.equal(publicationBasePath('', 'docs'), '/docs')
  assert.equal(publicationBasePath('/other/path', 'docs'), '/docs')
})

test('builds routes beneath the publication base path', () => {
  assert.equal(underPublication('/docs', '/api/config'), '/docs/api/config')
  assert.equal(underPublication('', '/api/config'), '/api/config')
  assert.equal(underPublication('/docs/', 'articles/start/'), '/docs/articles/start/')
})

test('route construction with nested routes and empty inputs', () => {
  assert.equal(underPublication('/docs', 'articles/start/'), '/docs/articles/start/')
  assert.equal(underPublication('/docs', '/'), '/docs/')
  assert.equal(underPublication('', ''), '/')
  assert.equal(underPublication('/docs/', ''), '/docs/')
  assert.equal(underPublication('/docs', 'api/search?q=test'), '/docs/api/search?q=test')
})

test('note/path round-trip and prefix stripping with query/hash', () => {
  const base = publicationBasePath('/docs/articles/start/', '')
  assert.equal(base, '/docs')
  assert.equal(stripPublicationBase('/docs/articles/start/', base), '/articles/start/')
  assert.equal(stripPublicationBase('/docs/articles/start/?x=1#y', base), '/articles/start/')
  assert.equal(stripPublicationBase('/docs/', base), '/')
  const route = underPublication(base, '/api/markdown')
  assert.equal(route, '/docs/api/markdown')
  assert.equal(stripPublicationBase(route, base), '/api/markdown')
})

test('URL encoding in base derivation and route construction', () => {
  assert.equal(publicationBasePath('', 'hello%20world'), '/hello%2520world')
  assert.equal(publicationBasePath('', 'hello world'), '/hello%20world')
  assert.equal(underPublication('/hello%20world', '/api/config'), '/hello%20world/api/config')
})

test('external/protocol-relative/fragment/non-http classification', () => {
  assert.equal(isExternalUrl(''), false)
  assert.equal(isExternalUrl('#anchor'), true)
  assert.equal(isExternalUrl('//'), true)
  assert.equal(isExternalUrl('javascript:void(0)'), true)
  assert.equal(isExternalUrl('ftp://example.com'), true)
  assert.equal(isExternalUrl('file:///etc/passwd'), true)
  assert.equal(isExternalUrl('mailto:test@example.com'), true)
  assert.equal(isExternalUrl('tel:+123'), true)
  assert.equal(isExternalUrl('data:text/html,hello'), true)
  assert.equal(isExternalUrl('https://example.com'), true)
  assert.equal(isExternalUrl('relative/file.md'), false)
  assert.equal(isExternalUrl('/assets/img.png'), false)
})

test('strips only the publication prefix from browser paths', () => {
  assert.equal(stripPublicationBase('/docs/articles/start/', '/docs'), '/articles/start/')
  assert.equal(stripPublicationBase('/documents/start/', '/docs'), '/documents/start/')
  assert.equal(stripPublicationBase('/articles/start/', ''), '/articles/start/')
})

test('keeps external and fragment links out of publication URL rewriting', () => {
  for (const value of [
    'https://example.com/docs',
    'HTTP://example.com',
    '//cdn.example.com/app.js',
    'mailto:user@example.com',
    'tel:+1234567',
    'data:text/plain,hello',
    '#section',
  ]) {
    assert.equal(isExternalUrl(value), true, value)
  }
  for (const value of ['/assets/image.png', 'notes/start.md', 'relative/file']) {
    assert.equal(isExternalUrl(value), false, value)
  }
})
