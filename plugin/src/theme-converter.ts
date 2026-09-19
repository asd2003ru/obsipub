export interface ConvertResult {
  css: string;
  warnings: string[];
  manifest: { name: string; source?: string };
}

export function safeBasename(sourceName: string): string {
  const lastPart = sourceName.split(/[\\/]/).pop() || sourceName;
  const stripped = lastPart.replace(/\.[^.]+$/, "");
  let safe = stripped.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (safe === "." || safe === "..") safe = "theme";
  const base = safe || "theme";
  return base + ".css";
}

export function sanitizeSchemeId(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "-");
  return safe || "theme";
}

function isSafeColorValue(value: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^rgb\([^)]+\)$/i.test(value) || /^rgba\([^)]+\)$/i.test(value) || /^(?:transparent|black|white)$/i.test(value);
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const color = value.trim().replace(/^['"]|['"]$/g, "");
  if (/^[0-9a-f]{6,8}$/i.test(color)) return `#${color}`;
  return isSafeColorValue(color) ? color : undefined;
}

export function parseTaintedYAML(content: string): {
  system?: string;
  name?: string;
  variant?: string;
  palette?: Record<string, string>;
  syntax?: Record<string, string>;
  ui?: Record<string, string>;
} {
  const result: any = { palette: {}, syntax: {}, ui: {} };
  const lines = content.split("\n");
  let currentSection: string | null = null;
  let currentSubKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed === "scheme:") {
      currentSection = "scheme";
      result.scheme = {};
      continue;
    }
    if (trimmed === "palette:") {
      currentSection = "palette";
      result.palette = {};
      continue;
    }
    if (trimmed === "syntax:") {
      currentSection = "syntax";
      result.syntax = {};
      continue;
    }
    if (trimmed === "ui:") {
      currentSection = "ui";
      result.ui = {};
      continue;
    }

    // Nested sections inside scheme (supports, styling-spec, etc.)
    if (currentSection === "scheme" && trimmed.endsWith(":")) {
      const sectionName = trimmed.slice(0, -1);
      currentSubKey = sectionName;
      result.scheme[sectionName] = {};
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      const legacyNames: Record<string, string> = {
        base00: "black", base01: "black_dim", base02: "gray_dark", base03: "gray",
        base04: "gray_light", base05: "white", base06: "white_bright", base07: "white",
        base08: "red", base09: "orange", base0a: "yellow", base0b: "green",
        base0c: "cyan", base0d: "blue", base0e: "magenta", base0f: "brown",
      };
      if (legacyNames[key.toLowerCase()]) {
        result.palette[legacyNames[key.toLowerCase()]] = value;
      } else if (currentSection === "scheme") {
        if (currentSubKey && value === "") {
          // nested object start handled above
          continue;
        }
        if (currentSubKey && result.scheme[currentSubKey] && typeof result.scheme[currentSubKey] === "object") {
          result.scheme[currentSubKey][key] = value;
        } else {
          result.scheme[key] = value;
        }
      } else if (currentSection === "palette") {
        result.palette[key] = value;
      } else if (currentSection === "syntax") {
        result.syntax[key] = value;
      } else if (currentSection === "ui") {
        result.ui[key] = value;
      }
    }
  }

  return {
    system: typeof result.scheme?.system === "string" ? result.scheme.system : undefined,
    name: typeof result.scheme?.name === "string" ? result.scheme.name : undefined,
    variant: typeof result.scheme?.variant === "string" ? result.scheme.variant : undefined,
    palette: result.palette,
    syntax: result.syntax,
    ui: result.ui,
  };
}

export function generateThemeCSS(parsed: any): string {
  const buildValues = (source: any, mode: "light" | "dark") => {
    const palette = source?.palette || {};
    const ui = source?.ui || {};

  // Tinted8 defines the semantic UI colors separately from its terminal palette.
  // Prefer these values when present (for example chrome.background.dark and
  // highlight.text.foreground), then fall back to the eight-color palette.
  const uiColor = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = normalizeColor(ui[key]);
      if (value) return value;
    }
    return undefined;
  };
    const paletteAliases: Record<string, string[]> = {
    black: ["black", "base00"], gray: ["gray", "base03"], white: ["white", "base07"],
    red: ["red", "base08"], orange: ["orange", "base09"], yellow: ["yellow", "base0A"],
    green: ["green", "base0B"], cyan: ["cyan", "base0C"], blue: ["blue", "base0D"],
    magenta: ["magenta", "base0E"], brown: ["brown", "base0F"],
    };
    const paletteColor = (key: string, fallback?: string): string | undefined => {
      for (const alias of paletteAliases[key] || [key]) {
        const value = normalizeColor(palette[alias]);
        if (value) return value;
      }
      return fallback;
    };
    const background = mode === "light"
      ? uiColor("chrome.background.light", "background.light", "background.normal") || paletteColor("white") || paletteColor("black")
      : uiColor("chrome.background.dark", "background.dark", "background.normal") || paletteColor("black") || paletteColor("white");
    const foreground = mode === "light"
      ? uiColor("chrome.foreground.light", "foreground.light", "foreground.normal", "highlight.text.foreground") || paletteColor("black") || paletteColor("white")
      : uiColor("chrome.foreground.dark", "foreground.dark", "foreground.normal", "highlight.text.foreground") || paletteColor("white") || paletteColor("black");
    const panel = mode === "light"
      ? uiColor("chrome.background.light", "background.light", "background.normal") || paletteColor("white") || background
      : uiColor("chrome.background.dark", "background.dark", "background.normal") || paletteColor("black") || background;
    const muted = uiColor(mode === "light" ? "foreground.dim.light" : "foreground.dim.dark", "foreground.dim", "foreground.normal") || paletteColor("gray");
    const border = uiColor(mode === "light" ? "chrome.border.light" : "chrome.border.dark", "border.normal", "highlight.background") || paletteColor("gray");
    const accent = uiColor(mode === "light" ? "accent.light" : "accent.dark", "accent.normal", "highlight.text.foreground") || paletteColor("blue") || paletteColor("cyan");
    return { palette, background, foreground, panel, muted, border, accent };
  };
  const lightValues = buildValues(parsed?.light || parsed, "light");
  const darkValues = buildValues(parsed?.dark || parsed, "dark");

  const lines: string[] = ["/* Converted from Tinted theme — review before publishing. */"];

  // Generate variables for both modes
  const generateModeVars = (mode: "light" | "dark") => {
    const { palette, background, foreground, panel, muted, border, accent } = mode === "dark" ? darkValues : lightValues;
    const vars: string[] = [];
    if (mode === "dark") {
      vars.push(`  --bg: ${background || "#0f1322"};`);
      vars.push(`  --panel: ${panel || "#161b2e"};`);
      vars.push(`  --text: ${foreground || "#e6eaf0"};`);
      vars.push(`  --muted: ${muted || "#9aa3b8"};`);
      vars.push(`  --border: ${border || "#2a3050"};`);
      vars.push(`  --accent: ${accent || "#6b8cce"};`);
      vars.push(`  --accent-soft: ${(accent || "#6b8cce") + "22"};`);
      vars.push(`  --danger: ${palette.red || "#ff6b6b"};`);
      vars.push(`  --danger-bg: ${(palette.red || "#ff6b6b") + "22"};`);
      vars.push(`  --code-bg: ${panel || "#1a2035"};`);
      vars.push(`  --code-normal: ${foreground || "#e6eaf0"};`);
      vars.push(`  --shadow: 0 18px 50px rgba(0, 0, 0, 0.3);`);
      vars.push(`  --link-color: ${accent || "#6b8cce"};`);
      vars.push(`  --obs-canvas: ${background || "#0f1322"};`);
      vars.push(`  --obs-sidebar: ${panel || "#161b2e"};`);
      vars.push(`  --obs-topbar: ${panel || "#1c2338"};`);
      vars.push(`  --obs-border: ${border || "#2a3050"};`);
      vars.push(`  --obs-text: ${foreground || "#e6eaf0"};`);
      vars.push(`  --obs-muted: ${muted || "#9aa3b8"};`);
      vars.push(`  --obs-code-bg: ${panel || "#1a2035"};`);
      vars.push(`  --obs-callout-color-note: ${palette.blue || palette.cyan || "#6b8cce"};`);
      vars.push(`  --obs-callout-color-tip: ${palette.green || "#6bcb77"};`);
      vars.push(`  --obs-callout-color-success: ${palette.green || "#6bcb77"};`);
      vars.push(`  --obs-callout-color-warning: ${palette.yellow || palette.orange || "#ffd166"};`);
      vars.push(`  --obs-callout-color-danger: ${palette.red || "#ff6b6b"};`);
      vars.push(`  --obs-callout-color-question: ${palette.magenta || "#c08bc8"};`);
      vars.push(`  --obs-callout-color-quote: ${palette.cyan || palette.gray || "#88c0d0"};`);
    } else {
      vars.push(`  --bg: ${background || "#f5f7fa"};`);
      vars.push(`  --panel: ${panel || "#ffffff"};`);
      vars.push(`  --text: ${foreground || "#1a2332"};`);
      vars.push(`  --muted: ${muted || "#5a6b7b"};`);
      vars.push(`  --border: ${border || "#c8d1e0"};`);
      vars.push(`  --accent: ${accent || "#2a5ca8"};`);
      vars.push(`  --accent-soft: ${(accent || "#2a5ca8") + "22"};`);
      vars.push(`  --danger: ${palette.red || "#b42318"};`);
      vars.push(`  --danger-bg: ${(palette.red || "#b42318") + "22"};`);
      vars.push(`  --code-bg: ${panel || "#eef3f8"};`);
      vars.push(`  --code-normal: ${foreground || "#1a2332"};`);
      vars.push(`  --shadow: 0 18px 50px rgba(40, 33, 23, 0.09);`);
      vars.push(`  --link-color: ${accent || "#2a5ca8"};`);
      vars.push(`  --obs-canvas: ${background || "#f5f7fa"};`);
      vars.push(`  --obs-sidebar: ${panel || "#ffffff"};`);
      vars.push(`  --obs-topbar: ${panel || "#eef3f8"};`);
      vars.push(`  --obs-border: ${border || "#c8d1e0"};`);
      vars.push(`  --obs-text: ${foreground || "#1a2332"};`);
      vars.push(`  --obs-muted: ${muted || "#5a6b7b"};`);
      vars.push(`  --obs-code-bg: ${panel || "#eef3f8"};`);
      vars.push(`  --obs-callout-color-note: ${palette.blue || palette.cyan || "#3b82f6"};`);
      vars.push(`  --obs-callout-color-tip: ${palette.green || "#16a34a"};`);
      vars.push(`  --obs-callout-color-success: ${palette.green || "#16a34a"};`);
      vars.push(`  --obs-callout-color-warning: ${palette.yellow || palette.orange || "#d97706"};`);
      vars.push(`  --obs-callout-color-danger: ${palette.red || "#dc2626"};`);
      vars.push(`  --obs-callout-color-question: ${palette.magenta || "#7c3aed"};`);
      vars.push(`  --obs-callout-color-quote: ${palette.cyan || palette.gray || "#0891b2"};`);
    }
    return vars.join("\n");
  };

  lines.push(`body.theme-light {`);
  lines.push(generateModeVars("light"));
  lines.push("}");
  lines.push("");
  lines.push(`body.theme-dark {`);
  lines.push(generateModeVars("dark"));
  lines.push("}");
  lines.push("");

  return lines.join("\n") + "\n";
}

export async function fetchTaintedScheme(schemeId: string): Promise<string> {
  const safeId = sanitizeSchemeId(schemeId);
  const url = `https://raw.githubusercontent.com/tinted-theming/schemes/spec-0.11/${safeId}.yaml`;
  // The actual URL format depends on the scheme ID format (e.g. tinted8/nord.yaml)
  // We'll try both direct and folder-based paths.
  // Since requestUrl is passed by the caller, we don't call it here directly.
  return url;
}
