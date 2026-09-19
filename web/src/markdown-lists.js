function whitespaceLength(line) {
  let len = 0
  for (const ch of String(line || '')) {
    if (ch === ' ' || ch === '\t') len++
    else break
  }
  return len
}

function isUnorderedMarker(trimmed) {
  return /^[-*+]\s+/.test(trimmed)
}

function isOrderedMarker(trimmed) {
  return /^\d+\.\s+/.test(trimmed)
}

function consumeItem(lines, i, baseIndent, listType, renderInlineFn) {
  const markerLine = lines[i]
  let isTask = false
  let checked = false
  let textAfterMarker = ''

  const trimmedLine = String(markerLine).trim()
  const unorderedTaskMatch = trimmedLine.match(/^[-*+]\s+\[([^\]])\]\s+(.+)$/)
  if (unorderedTaskMatch) {
    isTask = true
    checked = unorderedTaskMatch[1].trim() !== ''
    textAfterMarker = unorderedTaskMatch[2]
  } else {
    const orderedTaskMatch = trimmedLine.match(/^\d+\.\s+\[([^\]])\]\s+(.+)$/)
    if (orderedTaskMatch) {
      isTask = true
      checked = orderedTaskMatch[1].trim() !== ''
      textAfterMarker = orderedTaskMatch[2]
    } else {
      textAfterMarker = trimmedLine.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '')
    }
  }

  const textLines = [textAfterMarker]
  i += 1
  const nestedHtmlParts = []

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      break
    }

    const indent = whitespaceLength(line)
    if (indent < baseIndent) {
      break
    }

    if (indent === baseIndent) {
      if (isOrderedMarker(trimmed) && listType === 'ol') {
        break
      }
      if (isUnorderedMarker(trimmed) && listType === 'ul') {
        break
      }
      if (isOrderedMarker(trimmed) || isUnorderedMarker(trimmed)) {
        // Different list type at same indent: break out.
        break
      }
      break
    }

    // indent > baseIndent
    if (isOrderedMarker(trimmed) || isUnorderedMarker(trimmed)) {
      const nestedIndent = indent
      const nestedType = isOrderedMarker(trimmed) ? 'ol' : 'ul'
      const nestedResult = renderNestedList(lines, i, renderInlineFn, nestedIndent, nestedType)
      nestedHtmlParts.push(nestedResult.html)
      i = nestedResult.nextIndex
    } else {
      textLines.push(line.trimStart())
      i += 1
    }
  }

  const innerText = textLines.map((l) => renderInlineFn(l)).join('<br>')
  const innerNested = nestedHtmlParts.join('')
  const liClass = isTask ? ' class="task-list-item"' : ''
  const checkbox = isTask
    ? `<input class="task-list-item-checkbox" type="checkbox" disabled${checked ? ' checked' : ''}>`
    : ''
  return {
    html: `<li${liClass}>${checkbox}${innerText}${innerNested}</li>`,
    nextIndex: i,
  }
}

export function renderNestedList(lines, i, renderInlineFn, baseIndent = null, listType = null) {
  // Determine base indent and list type from first line.
  if (baseIndent === null || listType === null) {
    while (i < lines.length && !String(lines[i]).trim()) i += 1
    if (i >= lines.length) return { html: '', nextIndex: i }
    baseIndent = whitespaceLength(lines[i])
    const trimmed = String(lines[i]).trim()
    listType = isOrderedMarker(trimmed) ? 'ol' : 'ul'
  }

  const itemsHtml = []
  while (i < lines.length) {
    const line = lines[i]
    if (!String(line || '').trim()) {
      i += 1
      continue
    }
    const indent = whitespaceLength(line)
    if (indent < baseIndent) {
      break
    }
    if (indent > baseIndent) {
      // Deeper indent without being inside an item should not happen
      // after a proper item start; break to avoid mis-parsing.
      break
    }

    const trimmed = String(line).trim()
    const unorderedMarker = isUnorderedMarker(trimmed)
    const orderedMarker = isOrderedMarker(trimmed)
    if (listType === 'ul' && !unorderedMarker) {
      break
    }
    if (listType === 'ol' && !orderedMarker) {
      break
    }

    const itemResult = consumeItem(lines, i, baseIndent, listType, renderInlineFn)
    itemsHtml.push(itemResult.html)
    i = itemResult.nextIndex
  }

  const tag = listType === 'ol' ? 'ol' : 'ul'
  return { html: `<${tag}>${itemsHtml.join('')}</${tag}>`, nextIndex: i }
}
