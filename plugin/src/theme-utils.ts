export function isCustomThemeFileName(value: string): boolean {
  return value.length > 4 && /^[^/\\\x00-\x1f]+\.css$/i.test(value);
}

export function hasExternalThemeResources(css: string): boolean {
  return /@import\b|url\s*\(\s*(?!(?:["']?data:))/i.test(css);
}
