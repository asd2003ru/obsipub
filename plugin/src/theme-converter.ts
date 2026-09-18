export interface ConvertResult {
  css: string;
  warnings: string[];
}

export interface ThemeImportResult {
  css: string;
  warnings: string[];
}

export interface ThemeResourceResult {
  css: string;
  warnings: string[];
}

const tokens: Record<string, string[]> = {
  "--background-primary": ["--obs-canvas", "--bg"],
  "--background-secondary": ["--obs-sidebar", "--panel"],
  "--background-secondary-alt": ["--obs-topbar"],
  "--text-normal": ["--obs-text", "--text"],
  "--text-muted": ["--obs-muted", "--muted"],
  "--background-modifier-border": ["--obs-border", "--border"],
  "--interactive-accent": ["--accent", "--link-color"],
  "--text-error": ["--danger"],
  "--code-background": ["--obs-code-bg", "--code-bg"],
  "--background-modifier-hover": ["--accent-soft"],
};

export function isSimpleColor(value: string): boolean {
  return (
    /^#[0-9a-f]{3,8}$/i.test(value) ||
    /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(value) ||
    /^(?:transparent|black|white)$/i.test(value)
  );
}

export function safeBasename(sourceName: string): string {
  const lastPart = sourceName.split(/[\\/]/).pop() || sourceName;
  const stripped = lastPart.replace(/\.[^.]+$/, "");
  let safe = stripped.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (safe === "." || safe === "..") safe = "theme";
  const base = safe || "theme";
  return base + ".css";
}

function resolveRelativePath(from: string, imported: string): string | null {
  if (/^(?:[a-z]+:|\/|#)/i.test(imported)) return null;
  const parts = `${from.slice(0, from.lastIndexOf("/") + 1)}${imported}`.split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!result.length) return null;
      result.pop();
    } else {
      result.push(part);
    }
  }
  return result.join("/");
}

/** Inline local CSS imports before conversion; external imports are skipped. */
export async function inlineLocalImports(
  css: string,
  sourcePath: string,
  readFile: (path: string) => Promise<string>,
  seen = new Set<string>()
): Promise<ThemeImportResult> {
  const warnings: string[] = [];
  const importPattern = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/gi;
  let output = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(css)) !== null) {
    output += css.slice(lastIndex, match.index);
    lastIndex = importPattern.lastIndex;
    const importedPath = resolveRelativePath(sourcePath, match[1]);
    if (!importedPath) {
      warnings.push(`Skipped external import: ${match[1]}`);
      continue;
    }
    if (seen.has(importedPath)) {
      warnings.push(`Skipped circular import: ${importedPath}`);
      continue;
    }
    try {
      seen.add(importedPath);
      const imported = await inlineLocalImports(await readFile(importedPath), importedPath, readFile, seen);
      output += imported.css;
      warnings.push(...imported.warnings);
    } catch {
      warnings.push(`Skipped unreadable import: ${importedPath}`);
    }
  }
  output += css.slice(lastIndex);
  return { css: output, warnings };
}

/** Replace local/remote CSS url() resources with data URLs. */
export async function inlineCssUrls(
  css: string,
  loadResource: (url: string) => Promise<string>
): Promise<ThemeResourceResult> {
  const warnings: string[] = [];
  const pattern = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
  let output = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    output += css.slice(lastIndex, match.index);
    lastIndex = pattern.lastIndex;
    const resource = match[2].trim();
    if (/^data:/i.test(resource)) {
      output += match[0];
      continue;
    }
    try {
      output += `url(${await loadResource(resource)})`;
    } catch {
      warnings.push(`Skipped unreadable resource: ${resource}`);
      output += "none";
    }
  }
  output += css.slice(lastIndex);
  return { css: output, warnings };
}

export function convert(css: string): ConvertResult {
  const warnings: string[] = [];
  css = css.replace(/@import[^;]*;/gi, "");
  if (/url\s*\(\s*(?!(?:["']?data:))/i.test(css)) {
    throw new Error("Theme contains url(); ObsiPub themes must be self-contained");
  }
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const modes: Record<string, Map<string, string>> = {
    light: new Map(),
    dark: new Map(),
  };
  const base = new Map<string, string>();
  const blockRegex = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(clean)) !== null) {
    const selector = match[1].trim();
    const modeMatch = /^(?:body)?\.theme-(light|dark)$/.exec(selector);
    const mode = modeMatch ? modeMatch[1] : null;
    const isBase = selector === "body" || selector === ":root";
    if (!mode && !isBase) {
      warnings.push(`Skipped selector: ${selector}`);
      continue;
    }
    for (const declaration of match[2].split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 0) continue;
      const name = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).trim();
      if (!tokens[name]) continue;
      if (!isSimpleColor(value)) {
        warnings.push(`Skipped non-literal color ${name} in ${mode} mode`);
        continue;
      }
      for (const output of tokens[name]) {
        if (mode) modes[mode].set(output, value);
        else base.set(output, value);
      }
    }
  }
  for (const [name, value] of base) {
    if (!modes.light.has(name)) modes.light.set(name, value);
    if (!modes.dark.has(name)) modes.dark.set(name, value);
  }
  const lines: string[] = [
    "/* ObsiPub color tokens converted from an Obsidian theme. Review before publishing. */",
  ];
  for (const mode of ["light", "dark"] as const) {
    const modeMap = modes[mode];
    if (!modeMap || !modeMap.size) {
      warnings.push(`No supported literal colors found for ${mode} mode`);
      continue;
    }
    lines.push(`body.theme-${mode} {`);
    for (const [name, value] of modeMap) {
      lines.push(`  ${name}: ${value};`);
    }
    lines.push("}");
  }
  return { css: lines.join("\n") + "\n", warnings };
}
