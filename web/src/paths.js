/**
 * Publication URLs are rooted at /<prefix> for multisite publications and
 * at / for the legacy default publication.
 */
export function publicationBasePath(pathname, prefix = '') {
  if (prefix) return `/${encodeURIComponent(prefix)}`
  const path = String(pathname || '').split(/[?#]/, 1)[0]
  const first = path.replace(/^\/+|\/+$/g, '').split('/')[0]
  return first && !first.includes('.') ? `/${encodeURIComponent(decodeURIComponent(first))}` : ''
}

export function underPublication(basePath, route) {
  const base = String(basePath || '').replace(/\/+$/, '')
  const suffix = `/${String(route || '').replace(/^\/+/, '')}`
  return `${base}${suffix}` || '/'
}

export function stripPublicationBase(pathname, basePath) {
  const path = String(pathname || '').split(/[?#]/, 1)[0] || '/'
  const base = String(basePath || '').replace(/\/+$/, '')
  if (!base) return path
  if (path === base || path.startsWith(`${base}/`)) return path.slice(base.length) || '/'
  return path
}

/**
 * Return true for URLs that must be left untouched by publication rewriting.
 * This includes absolute/protocol-relative URLs, non-http schemes (mailto,
 * tel, etc.), and document-fragment links.
 */
export function isExternalUrl(value) {
  const url = String(value || '').trim()
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)
}
