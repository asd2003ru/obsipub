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

const paletteAliases: Record<string, string[]> = {
  black: ["black", "base00"], gray: ["gray", "base03"], white: ["white", "base07"],
  red: ["red", "base08"], orange: ["orange", "base09"], yellow: ["yellow", "base0A"],
  green: ["green", "base0B"], cyan: ["cyan", "base0C"], blue: ["blue", "base0D"],
  magenta: ["magenta", "base0E"], brown: ["brown", "base0F"],
};

function paletteColor(palette: Record<string, string>, key: string, fallback?: string): string | undefined {
  for (const alias of paletteAliases[key] || [key]) {
    const value = normalizeColor(palette[alias]);
    if (value) return value;
  }
  return fallback;
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
    const background = mode === "light"
      ? uiColor("chrome.background.light", "background.light", "background.normal") || paletteColor(palette, "black") || paletteColor(palette, "white")
      : uiColor("chrome.background.dark", "background.dark", "background.normal") || paletteColor(palette, "black") || paletteColor(palette, "white");
    const foreground = mode === "light"
      ? uiColor("chrome.foreground.light", "foreground.light", "foreground.normal", "highlight.text.foreground") || paletteColor(palette, "white") || paletteColor(palette, "black")
      : uiColor("chrome.foreground.dark", "foreground.dark", "foreground.normal", "highlight.text.foreground") || paletteColor(palette, "white") || paletteColor(palette, "black");
    const panel = mode === "light"
      ? uiColor("chrome.background.light", "background.light", "background.normal") || paletteColor(palette, "black") || background
      : uiColor("chrome.background.dark", "background.dark", "background.normal") || paletteColor(palette, "black") || background;
    const muted = uiColor(mode === "light" ? "foreground.dim.light" : "foreground.dim.dark", "foreground.dim", "foreground.normal") || paletteColor(palette, "gray");
    const border = uiColor(mode === "light" ? "chrome.border.light" : "chrome.border.dark", "border.normal", "highlight.background") || paletteColor(palette, "gray");
    const accent = uiColor(mode === "light" ? "accent.light" : "accent.dark", "accent.normal", "highlight.text.foreground") || paletteColor(palette, "blue") || paletteColor(palette, "cyan");
    const selection = uiColor("selection.background", "highlight.background") || paletteColor(palette, "gray_dark") || paletteColor(palette, "blue");
    const danger = uiColor("error.foreground", "danger.foreground") || paletteColor(palette, "red") || "#dc2626";
    const warning = uiColor("warning.foreground") || paletteColor(palette, "orange") || paletteColor(palette, "yellow") || "#d97706";
    const success = uiColor("success.foreground") || paletteColor(palette, "green") || "#16a34a";
    const info = uiColor("info.foreground") || paletteColor(palette, "cyan") || paletteColor(palette, "blue") || "#0891b2";
    const question = uiColor("question.foreground") || paletteColor(palette, "magenta") || "#7c3aed";
    const heading = uiColor("heading.foreground") || paletteColor(palette, "blue") || foreground;
    return { palette, background, foreground, panel, muted, border, accent, selection, danger, warning, success, info, question, heading };
  };
  const lightValues = buildValues(parsed?.light || parsed, "light");
  const darkValues = buildValues(parsed?.dark || parsed, "dark");

  const lines: string[] = ["/* Converted from Tinted theme — review before publishing. */"];

  // Generate variables for both modes
  const generateModeVars = (mode: "light" | "dark") => {
    const { palette, background, foreground, panel, muted, border, accent, selection, danger, warning, success, info, question, heading } = mode === "dark" ? darkValues : lightValues;
    const vars: string[] = [];
    if (mode === "dark") {
      vars.push(`  --bg: ${background || "#0f1322"};`);
      vars.push(`  --panel: ${panel || "#161b2e"};`);
      vars.push(`  --text: ${foreground || "#e6eaf0"};`);
      vars.push(`  --muted: ${muted || "#9aa3b8"};`);
      vars.push(`  --border: ${border || "#2a3050"};`);
      vars.push(`  --accent: ${accent || "#6b8cce"};`);
      vars.push(`  --accent-soft: ${(accent || "#6b8cce") + "22"};`);
      vars.push(`  --danger: ${danger};`);
      vars.push(`  --danger-bg: ${danger + "22"};`);
      vars.push(`  --code-bg: ${panel || "#1a2035"};`);
      vars.push(`  --code-normal: ${foreground || "#e6eaf0"};`);
      vars.push(`  --obs-selection: ${selection};`);
      vars.push(`  --obs-heading: ${heading};`);
      vars.push(`  --obs-danger: ${danger};`);
      vars.push(`  --obs-warning: ${warning};`);
      vars.push(`  --obs-success: ${success};`);
      vars.push(`  --obs-info: ${info};`);
      vars.push(`  --obs-question: ${question};`);
      vars.push(`  --obs-quote: ${info};`);
      vars.push(`  --shadow: 0 18px 50px rgba(0, 0, 0, 0.3);`);
      vars.push(`  --link-color: ${accent || "#6b8cce"};`);
      vars.push(`  --obs-canvas: ${background || "#0f1322"};`);
      vars.push(`  --obs-sidebar: ${panel || "#161b2e"};`);
      vars.push(`  --obs-topbar: ${panel || "#1c2338"};`);
      vars.push(`  --obs-border: ${border || "#2a3050"};`);
      vars.push(`  --obs-text: ${foreground || "#e6eaf0"};`);
      vars.push(`  --obs-muted: ${muted || "#9aa3b8"};`);
      vars.push(`  --obs-code-bg: ${panel || "#1a2035"};`);
      vars.push(`  --obs-callout-color-note: ${accent || info};`);
      vars.push(`  --obs-callout-color-tip: ${success};`);
      vars.push(`  --obs-callout-color-success: ${success};`);
      vars.push(`  --obs-callout-color-warning: ${warning};`);
      vars.push(`  --obs-callout-color-danger: ${danger};`);
      vars.push(`  --obs-callout-color-question: ${question};`);
      vars.push(`  --obs-callout-color-quote: ${info};`);
      vars.push(`  --syntax-comment: ${paletteColor(darkValues.palette || {}, "gray", muted) || muted || "#6a737d"};`);
      vars.push(`  --syntax-string: ${paletteColor(darkValues.palette || {}, "blue", accent) || accent || "#032f62"};`);
      vars.push(`  --syntax-number: ${paletteColor(darkValues.palette || {}, "yellow", accent) || accent || "#005cc5"};`);
      vars.push(`  --syntax-keyword: ${paletteColor(darkValues.palette || {}, "red", danger) || danger || "#d73a49"};`);
      vars.push(`  --syntax-function: ${paletteColor(darkValues.palette || {}, "magenta", accent) || accent || "#6f42c1"};`);
      vars.push(`  --syntax-type: ${paletteColor(darkValues.palette || {}, "green", success) || success || "#22863a"};`);
      vars.push(`  --syntax-property: ${paletteColor(darkValues.palette || {}, "blue", accent) || accent || "#005cc5"};`);
      vars.push(`  --syntax-operator: ${paletteColor(darkValues.palette || {}, "red", danger) || danger || "#d73a49"};`);
      vars.push(`  --syntax-punctuation: ${foreground || muted || "#24292e"};`);
    } else {
      vars.push(`  --bg: ${background || "#f5f7fa"};`);
      vars.push(`  --panel: ${panel || "#ffffff"};`);
      vars.push(`  --text: ${foreground || "#1a2332"};`);
      vars.push(`  --muted: ${muted || "#5a6b7b"};`);
      vars.push(`  --border: ${border || "#c8d1e0"};`);
      vars.push(`  --accent: ${accent || "#2a5ca8"};`);
      vars.push(`  --accent-soft: ${(accent || "#2a5ca8") + "22"};`);
      vars.push(`  --danger: ${danger};`);
      vars.push(`  --danger-bg: ${danger + "22"};`);
      vars.push(`  --code-bg: ${panel || "#eef3f8"};`);
      vars.push(`  --code-normal: ${foreground || "#1a2332"};`);
      vars.push(`  --obs-selection: ${selection};`);
      vars.push(`  --obs-heading: ${heading};`);
      vars.push(`  --obs-danger: ${danger};`);
      vars.push(`  --obs-warning: ${warning};`);
      vars.push(`  --obs-success: ${success};`);
      vars.push(`  --obs-info: ${info};`);
      vars.push(`  --obs-question: ${question};`);
      vars.push(`  --obs-quote: ${info};`);
      vars.push(`  --shadow: 0 18px 50px rgba(40, 33, 23, 0.09);`);
      vars.push(`  --link-color: ${accent || "#2a5ca8"};`);
      vars.push(`  --obs-canvas: ${background || "#f5f7fa"};`);
      vars.push(`  --obs-sidebar: ${panel || "#ffffff"};`);
      vars.push(`  --obs-topbar: ${panel || "#eef3f8"};`);
      vars.push(`  --obs-border: ${border || "#c8d1e0"};`);
      vars.push(`  --obs-text: ${foreground || "#1a2332"};`);
      vars.push(`  --obs-muted: ${muted || "#5a6b7b"};`);
      vars.push(`  --obs-code-bg: ${panel || "#eef3f8"};`);
      vars.push(`  --obs-callout-color-note: ${accent || info};`);
      vars.push(`  --obs-callout-color-tip: ${success};`);
      vars.push(`  --obs-callout-color-success: ${success};`);
      vars.push(`  --obs-callout-color-warning: ${warning};`);
      vars.push(`  --obs-callout-color-danger: ${danger};`);
      vars.push(`  --obs-callout-color-question: ${question};`);
      vars.push(`  --obs-callout-color-quote: ${info};`);
      vars.push(`  --syntax-comment: ${paletteColor(lightValues.palette || {}, "gray", muted) || muted || "#6a737d"};`);
      vars.push(`  --syntax-string: ${paletteColor(lightValues.palette || {}, "blue", accent) || accent || "#032f62"};`);
      vars.push(`  --syntax-number: ${paletteColor(lightValues.palette || {}, "yellow", accent) || accent || "#005cc5"};`);
      vars.push(`  --syntax-keyword: ${paletteColor(lightValues.palette || {}, "red", danger) || danger || "#d73a49"};`);
      vars.push(`  --syntax-function: ${paletteColor(lightValues.palette || {}, "magenta", accent) || accent || "#6f42c1"};`);
      vars.push(`  --syntax-type: ${paletteColor(lightValues.palette || {}, "green", success) || success || "#22863a"};`);
      vars.push(`  --syntax-property: ${paletteColor(lightValues.palette || {}, "blue", accent) || accent || "#005cc5"};`);
      vars.push(`  --syntax-operator: ${paletteColor(lightValues.palette || {}, "red", danger) || danger || "#d73a49"};`);
      vars.push(`  --syntax-punctuation: ${foreground || muted || "#24292e"};`);
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
