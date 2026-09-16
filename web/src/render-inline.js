export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function unescapeMarkdownPunctuation(text) {
  return String(text).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1')
}

export function parseEmphasis(text) {
  let result = ''
  let plain = ''
  let i = 0

  function flushPlain() {
    if (!plain) return
    result += escapeHtml(unescapeMarkdownPunctuation(plain))
    plain = ''
  }

  function findClose(start, marker) {
    let j = start
    while (j < text.length) {
      if (text[j] === '\\' && j + 1 < text.length) {
        j += 2
      } else if (text.slice(j, j + marker.length) === marker) {
        return j
      } else {
        j++
      }
    }
    return -1
  }

  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      plain += text.slice(i, i + 2)
      i += 2
      continue
    }

    // Obsidian comments are hidden in rendered view.
    if (text.slice(i, i + 2) === '%%') {
      const end = text.indexOf('%%', i + 2)
      if (end !== -1) {
        flushPlain()
        i = end + 2
        continue
      }
    }

    // Safe underline HTML tag only
    if (text.slice(i, i + 3) === '<u>') {
      const end = text.indexOf('</u>', i + 3)
      if (end !== -1) {
        flushPlain()
        const inner = text.slice(i + 3, end)
        result += `<u>${parseEmphasis(inner)}</u>`
        i = end + 4
        continue
      }
    }

    // Bold italic ***...***
    if (text.slice(i, i + 3) === '***') {
      const end = findClose(i + 3, '***')
      if (end !== -1) {
        flushPlain()
        const inner = text.slice(i + 3, end)
        result += `<strong><em>${parseEmphasis(inner)}</em></strong>`
        i = end + 3
        continue
      }
    }

    // Bold italic ___...___
    if (text.slice(i, i + 3) === '___') {
      const end = findClose(i + 3, '___')
      if (end !== -1) {
        flushPlain()
        const inner = text.slice(i + 3, end)
        result += `<strong><em>${parseEmphasis(inner)}</em></strong>`
        i = end + 3
        continue
      }
    }

    // Strikethrough ~~...~~
    if (text.slice(i, i + 2) === '~~') {
      const end = findClose(i + 2, '~~')
      if (end !== -1) {
        flushPlain()
        const inner = text.slice(i + 2, end)
        result += `<s>${parseEmphasis(inner)}</s>`
        i = end + 2
        continue
      }
    }

    // Highlight ==...==
    if (text.slice(i, i + 2) === '==') {
      const end = findClose(i + 2, '==')
      if (end !== -1) {
        flushPlain()
        const inner = text.slice(i + 2, end)
        result += `<mark>${parseEmphasis(inner)}</mark>`
        i = end + 2
        continue
      }
    }

    // Bold **...**
    if (text.slice(i, i + 2) === '**') {
      const end = findClose(i + 2, '**')
      if (end !== -1) {
        flushPlain()
        const inner = text.slice(i + 2, end)
        result += `<strong>${parseEmphasis(inner)}</strong>`
        i = end + 2
        continue
      }
    }

    // Bold __...__
    if (text.slice(i, i + 2) === '__') {
      const end = findClose(i + 2, '__')
      if (end !== -1) {
        flushPlain()
        const inner = text.slice(i + 2, end)
        result += `<strong>${parseEmphasis(inner)}</strong>`
        i = end + 2
        continue
      }
    }

    // Italic *...*
    if (text[i] === '*') {
      const end = findClose(i + 1, '*')
      if (end !== -1) {
        flushPlain()
        const inner = text.slice(i + 1, end)
        result += `<em>${parseEmphasis(inner)}</em>`
        i = end + 1
        continue
      }
    }

    // Italic _..._
    if (text[i] === '_') {
      const end = findClose(i + 1, '_')
      if (end !== -1) {
        flushPlain()
        const inner = text.slice(i + 1, end)
        result += `<em>${parseEmphasis(inner)}</em>`
        i = end + 1
        continue
      }
    }

    // Literal character
    plain += text[i]
    i++
  }

  flushPlain()
  return result
}
