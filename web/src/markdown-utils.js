export function stripFrontMatter(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') return String(source || '')
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---' || lines[index].trim() === '...') return lines.slice(index + 1).join('\n')
  }
  return String(source || '')
}

export function copyableMarkdown(source) {
  return stripFrontMatter(source)
}
