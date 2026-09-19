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

// Contrast correction helpers — only apply to opaque hex colors.
function parseOpaqueHex(value: string): { r: number; g: number; b: number } | undefined {
  const m = value.match(/^#([0-9a-f]{6})$/i);
  if (!m) return undefined;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return { r, g, b };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hexA: string, hexB: string): number | undefined {
  const a = parseOpaqueHex(hexA);
  const b = parseOpaqueHex(hexB);
  if (!a || !b) return undefined;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixHexTowardTarget(fgHex: string, targetHex: string, ratio: number): string {
  const fg = parseOpaqueHex(fgHex);
  const tgt = parseOpaqueHex(targetHex);
  if (!fg || !tgt) return fgHex;
  const mix = (c1: number, c2: number) => Math.round(c1 + (c2 - c1) * ratio);
  const r = mix(fg.r, tgt.r);
  const g = mix(fg.g, tgt.g);
  const b = mix(fg.b, tgt.b);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function adjustForegroundForContrast(foregroundHex: string, backgroundHex: string): string {
  const ratio = contrastRatio(foregroundHex, backgroundHex);
  if (ratio === undefined || ratio >= 4.5) return foregroundHex;
  const blackHex = "#000000";
  const whiteHex = "#ffffff";
  const cBlack = contrastRatio(blackHex, backgroundHex) || 0;
  const cWhite = contrastRatio(whiteHex, backgroundHex) || 0;
  const target = cBlack >= cWhite ? blackHex : whiteHex;
  // Binary search for minimal ratio that achieves >=4.5.
  let lo = 0;
  let hi = 1;
  let best = target;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const mixed = mixHexTowardTarget(foregroundHex, target, mid);
    const c = contrastRatio(mixed, backgroundHex);
    if (c !== undefined && c >= 4.5) {
      best = mixed;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}

function stripCommentOutsideQuotes(str: string): string {
  let inSingle = false;
  let inDouble = false;
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      result += ch;
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      result += ch;
    } else if (ch === '#' && !inSingle && !inDouble) {
      const rest = str.slice(i + 1);
      // If the rest starts with hex digits, treat as a hex color value, not a comment.
      if (rest.match(/^[0-9a-fA-F]{3,8}(?=[^0-9a-fA-F]|$)/)) {
        result += ch;
        // The loop will append the hex chars naturally.
      } else {
        break;
      }
    } else {
      result += ch;
    }
  }
  return result.trim();
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const color = value.trim().replace(/^['"]|['"]$/g, "");
  if (/^[0-9a-f]{6,8}$/i.test(color)) return `#${color}`;
  return isSafeColorValue(color) ? color : undefined;
}

const syntaxSpecificity: Record<string, string[]> = {
  "syntax-comment": ["comment.documentation", "comment.block", "comment.line", "comment.tag", "comment"],
  "syntax-string": ["string.interpolated", "string.template", "string.regexp", "string.quoted", "string.unquoted", "string"],
  "syntax-number": ["constant.numeric.integer", "constant.numeric.float", "constant.numeric", "number", "constant.language", "constant"],
  "syntax-keyword": ["keyword.control", "storage.type", "storage.modifier", "storage", "keyword"],
  "syntax-function": ["meta.function", "entity.name.function", "entity.name.method", "support.function", "function", "method"],
  "syntax-type": ["entity.name.interface", "entity.name.class", "entity.name.type", "support.type", "interface", "class", "type"],
  "syntax-property": ["entity.name.property", "entity.name.variable", "variable.other", "variable.parameter", "variable.language", "property", "variable", "entity.name.tag", "tag"],
  "syntax-operator": ["keyword.operator.logical", "keyword.operator.comparison", "keyword.operator.arithmetic", "keyword.operator.bitwise", "keyword.operator", "operator"],
  "syntax-punctuation": ["punctuation.brackets", "punctuation.brackets.angle", "punctuation.definition", "punctuation.separator", "punctuation.terminator", "punctuation.section", "meta.brace", "punctuation"],
};

function syntaxValue(normalizedSyntax: Record<string, string>, role: string): string | undefined {
  const keys = syntaxSpecificity[role] || [role];
  for (const k of keys) {
    const val = normalizedSyntax[k.toLowerCase()];
    if (val) {
      const norm = normalizeColor(val);
      if (norm) return norm;
    }
  }
  return undefined;
}

const paletteAliases: Record<string, string[]> = {
  black: ["black", "base00"], gray: ["gray", "base03"], white: ["white", "base07"],
  red: ["red", "base08"], orange: ["orange", "base09"], yellow: ["yellow", "base0A"],
  green: ["green", "base0B"], cyan: ["cyan", "base0C"], blue: ["blue", "base0D"],
  magenta: ["magenta", "base0E"], brown: ["brown", "base0F"],
};

function resolveSyntaxColor(
  syntaxSource: Record<string, string> | undefined,
  palette: Record<string, string>,
  role: string,
  standardAlias?: string
): string | undefined {
  const val = syntaxValue(syntaxSource || {}, role);
  if (val) return val;
  if (standardAlias) {
    const stdVal = paletteColor(palette, standardAlias);
    if (stdVal) return stdVal;
  }
  return undefined;
}

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
  const result: any = { palette: {}, syntax: {}, ui: {}, scheme: {} };
  const lines = content.split("\n");
  let currentSection: string | null = null;
  let currentSubKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
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
      let rawValue = trimmed.slice(colonIndex + 1).trim();
      rawValue = stripCommentOutsideQuotes(rawValue);
      let value = rawValue;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (indent === 0 && ["system", "name", "variant", "author"].includes(key.toLowerCase())) {
        result.scheme[key.toLowerCase()] = value;
        currentSubKey = null;
        continue;
      }
      const legacyNames: Record<string, string> = {
        base00: "black", base01: "black_dim", base02: "gray_dark", base03: "gray",
        base04: "gray_light", base05: "white", base06: "white_bright", base07: "white_brightest",
        base08: "red", base09: "orange", base0a: "yellow", base0b: "green",
        base0c: "cyan", base0d: "blue", base0e: "magenta", base0f: "brown",
        base10: "base10", base11: "base11", base12: "base12", base13: "base13",
        base14: "base14", base15: "base15", base16: "base16", base17: "base17",
      };
      if (legacyNames[key.toLowerCase()]) {
        result.palette[legacyNames[key.toLowerCase()]] = value;
      } else if (currentSection === "scheme") {
        if (indent <= 2) {
          result.scheme[key] = value;
          currentSubKey = null;
        } else if (currentSubKey && value === "") {
          // nested object start handled above
          continue;
        }
        const metaKeys = ["system", "name", "variant", "author"];
        if (currentSubKey && metaKeys.includes(key.toLowerCase()) && value !== "") {
          // A top-level metadata key after a nested sub-section should be reset to scheme level
          result.scheme[key.toLowerCase()] = value;
          currentSubKey = null;
        } else if (currentSubKey && result.scheme[currentSubKey] && typeof result.scheme[currentSubKey] === "object") {
          result.scheme[currentSubKey][key] = value;
        } else {
          result.scheme[key] = value;
          if (!currentSubKey) currentSubKey = null;
        }
      } else if (currentSection === "palette") {
        result.palette[key] = value;
      } else if (currentSection === "syntax") {
        result.syntax[key] = value;
      } else if (currentSection === "ui") {
        result.ui[key] = value;
      } else {
        // Top-level loose keys (Base16/Base24 metadata or palette values)
        const metaKeys = ["system", "name", "variant", "author"];
        if (metaKeys.includes(key.toLowerCase())) {
          result.scheme[key.toLowerCase()] = value;
        } else {
          result.palette[key] = value;
        }
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

function safeSyntaxCorrected(value: string, panelValue: string | undefined): string {
  if (!panelValue) return value;
  // Only apply correction when both values are parseable opaque 6-digit hex colors.
  const fgHex = value.match(/^#([0-9a-f]{6})$/i) ? value : undefined;
  const bgHex = panelValue.match(/^#([0-9a-f]{6})$/i) ? panelValue : undefined;
  if (!fgHex || !bgHex) return value;
  return adjustForegroundForContrast(fgHex, bgHex);
}

export function generateThemeCSS(parsed: any): string {
  const buildValues = (source: any, mode: "light" | "dark") => {
    const palette = source?.palette || {};
    const ui = source?.ui || {};
    const system = String(source?.system || "").toLowerCase();

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
      ? uiColor("chrome.background.light", "background.light", "background.normal") || (system === "tinted8" ? paletteColor(palette, "white") : paletteColor(palette, "black")) || paletteColor(palette, "white") || paletteColor(palette, "black")
      : uiColor("chrome.background.dark", "background.dark", "background.normal") || paletteColor(palette, "black") || paletteColor(palette, "white");
    const foreground = mode === "light"
      ? uiColor("chrome.foreground.light", "foreground.light", "foreground.normal", "highlight.text.foreground") || (system === "tinted8" ? paletteColor(palette, "black") : paletteColor(palette, "white")) || paletteColor(palette, "black") || paletteColor(palette, "white")
      : uiColor("chrome.foreground.dark", "foreground.dark", "foreground.normal", "highlight.text.foreground") || paletteColor(palette, "white") || paletteColor(palette, "black");
    const panel = mode === "light"
      ? uiColor("chrome.background.light", "background.light", "background.normal") || (system === "tinted8" ? paletteColor(palette, "white") : paletteColor(palette, "black")) || background
      : uiColor("chrome.background.dark", "background.dark", "background.normal") || paletteColor(palette, "black") || background;
    const mutedExplicit = uiColor(mode === "light" ? "foreground.dim.light" : "foreground.dim.dark", "foreground.dim", "foreground.normal");
    const mutedFallback = (foreground && background) ? `color-mix(in srgb, ${foreground} 62%, ${background})` : undefined;
    const muted = mutedExplicit || mutedFallback;
    const borderExplicit = uiColor(mode === "light" ? "chrome.border.light" : "chrome.border.dark", "border.normal", "highlight.background");
    const borderFallback = (foreground && background) ? `color-mix(in srgb, ${foreground} 20%, ${background})` : undefined;
    const border = borderExplicit || borderFallback;
    const accent = uiColor(mode === "light" ? "accent.light" : "accent.dark", "accent.normal", "highlight.text.foreground") || paletteColor(palette, "blue") || paletteColor(palette, "cyan");
    const selection = uiColor("selection.background", "highlight.background") || paletteColor(palette, "gray_dark") || paletteColor(palette, "blue");
    const danger = uiColor("error.foreground", "danger.foreground") || paletteColor(palette, "red") || "#dc2626";
    const warning = uiColor("warning.foreground") || paletteColor(palette, "orange") || paletteColor(palette, "yellow") || "#d97706";
    const success = uiColor("success.foreground") || paletteColor(palette, "green") || "#16a34a";
    const info = uiColor("info.foreground") || paletteColor(palette, "cyan") || paletteColor(palette, "blue") || "#0891b2";
    const question = uiColor("question.foreground") || paletteColor(palette, "magenta") || "#7c3aed";
    const syntaxRaw = source?.syntax || {};
    const syntaxNormalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(syntaxRaw)) {
      const color = normalizeColor(v);
      if (color) syntaxNormalized[k.toLowerCase()] = color;
    }
    const syntax = syntaxNormalized;
    const heading = uiColor("heading.foreground") || paletteColor(palette, "blue") || foreground;
    return { palette, syntax, system, background, foreground, panel, muted, border, accent, selection, danger, warning, success, info, question, heading };
  };
  const lightValues = buildValues(parsed?.light || parsed, "light");
  const darkValues = buildValues(parsed?.dark || parsed, "dark");

  const lines: string[] = ["/* Converted from Tinted theme — review before publishing. */"];

  // Generate variables for both modes
  const generateModeVars = (mode: "light" | "dark") => {
    const values = mode === "dark" ? darkValues : lightValues;
    const { palette, syntax, system, background, foreground, panel, muted, border, accent, selection, danger, warning, success, info, question, heading } = values;
    const isBase24 = system === "base24";
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
      vars.push(`  --obs-callout-foreground-warning: ${safeSyntaxCorrected(warning || "#d97706", panel)};`);
      vars.push(`  --obs-callout-color-danger: ${danger};`);
      vars.push(`  --obs-callout-color-question: ${question};`);
      vars.push(`  --obs-callout-color-quote: ${info};`);
      vars.push(`  --syntax-comment: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-comment", "gray") || muted || "#6a737d", panel)};`);
      vars.push(`  --syntax-string: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-string", "green") || accent || "#22863a", panel)};`);
      vars.push(`  --syntax-number: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-number", "orange") || accent || "#d97706", panel)};`);
      vars.push(`  --syntax-keyword: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-keyword", "magenta") || accent || "#6f42c1", panel)};`);
      vars.push(`  --syntax-function: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-function", "blue") || accent || "#005cc5", panel)};`);
      vars.push(`  --syntax-type: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-type", "yellow") || accent || "#b8860b", panel)};`);
      vars.push(`  --syntax-property: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-property", "red") || danger || "#d73a49", panel)};`);
      vars.push(`  --syntax-operator: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-operator", "magenta") || accent || "#6f42c1", panel)};`);
      vars.push(`  --syntax-punctuation: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-punctuation", undefined) || foreground || muted || "#24292e", panel)};`);
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
      vars.push(`  --obs-callout-foreground-warning: ${safeSyntaxCorrected(warning || "#d97706", panel)};`);
      vars.push(`  --obs-callout-color-danger: ${danger};`);
      vars.push(`  --obs-callout-color-question: ${question};`);
      vars.push(`  --obs-callout-color-quote: ${info};`);
      vars.push(`  --syntax-comment: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-comment", "gray") || muted || "#6a737d", panel)};`);
      vars.push(`  --syntax-string: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-string", "green") || accent || "#22863a", panel)};`);
      vars.push(`  --syntax-number: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-number", "orange") || accent || "#d97706", panel)};`);
      vars.push(`  --syntax-keyword: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-keyword", "magenta") || accent || "#6f42c1", panel)};`);
      vars.push(`  --syntax-function: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-function", "blue") || accent || "#005cc5", panel)};`);
      vars.push(`  --syntax-type: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-type", "yellow") || accent || "#b8860b", panel)};`);
      vars.push(`  --syntax-property: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-property", "red") || danger || "#d73a49", panel)};`);
      vars.push(`  --syntax-operator: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-operator", "magenta") || accent || "#6f42c1", panel)};`);
      vars.push(`  --syntax-punctuation: ${safeSyntaxCorrected(resolveSyntaxColor(syntax, palette, "syntax-punctuation", undefined) || foreground || muted || "#24292e", panel)};`);
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
