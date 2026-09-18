export interface ConvertResult {
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

export function convert(css: string): ConvertResult {
  if (/@import\b|url\s*\(/i.test(css)) {
    throw new Error(
      "Theme contains @import or url(); ObsiPub themes must be self-contained"
    );
  }
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const modes: Record<string, Map<string, string>> = {
    light: new Map(),
    dark: new Map(),
  };
  const warnings: string[] = [];
  const blockRegex = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(clean)) !== null) {
    const selector = match[1].trim();
    const modeMatch = /^(?:body)?\.theme-(light|dark)$/.exec(selector);
    const mode = modeMatch ? modeMatch[1] : null;
    if (!mode) {
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
        modes[mode].set(output, value);
      }
    }
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
  if ((!modes.light || !modes.light.size) && (!modes.dark || !modes.dark.size)) {
    throw new Error("No supported theme colors found");
  }
  return { css: lines.join("\n") + "\n", warnings };
}
