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
      if (currentSection === "scheme") {
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
  const palette = parsed.palette || {};
  const syntax = parsed.syntax || {};
  const ui = parsed.ui || {};

  const lines: string[] = ["/* Converted from Tinted theme — review before publishing. */"];

  const lightVars: string[] = [];
  const darkVars: string[] = [];

  const addVar = (vars: string[], key: string, value: string) => {
    vars.push(`  ${key}: ${value};`);
  };

  // Basic semantic mapping using palette colors directly for dark,
  // and lightened/inferred values for light.
  const darkColor = (key: string, fallbackDark: string, fallbackLight: string) => palette[key] || (key.endsWith("-bg") ? fallbackDark : fallbackDark);
  const lightColor = (key: string, fallbackDark: string, fallbackLight: string) => {
    if (palette[key]) return palette[key];
    return fallbackLight;
  };

  // Generate variables for both modes
  const generateModeVars = (mode: "light" | "dark") => {
    const vars: string[] = [];
    if (mode === "dark") {
      vars.push(`  --bg: ${palette.black || "#0f1322"};`);
      vars.push(`  --panel: ${palette.black ? palette.black + "ee" : "#161b2e"};`);
      vars.push(`  --text: ${palette.white || "#e6eaf0"};`);
      vars.push(`  --muted: ${palette.gray || "#9aa3b8"};`);
      vars.push(`  --border: ${palette.gray ? palette.gray + "66" : "#2a3050"};`);
      vars.push(`  --accent: ${palette.blue || palette.cyan || "#6b8cce"};`);
      vars.push(`  --accent-soft: ${(palette.blue || palette.cyan || "#6b8cce") + "22"};`);
      vars.push(`  --danger: ${palette.red || "#ff6b6b"};`);
      vars.push(`  --danger-bg: ${(palette.red || "#ff6b6b") + "22"};`);
      vars.push(`  --code-bg: ${palette.black ? palette.black + "ee" : "#1a2035"};`);
      vars.push(`  --shadow: 0 18px 50px rgba(0, 0, 0, 0.3);`);
      vars.push(`  --link-color: ${palette.blue || palette.cyan || "#6b8cce"};`);
      vars.push(`  --obs-canvas: ${palette.black || "#0f1322"};`);
      vars.push(`  --obs-sidebar: ${palette.black ? palette.black + "ee" : "#161b2e"};`);
      vars.push(`  --obs-topbar: ${palette.black ? palette.black + "dd" : "#1c2338"};`);
      vars.push(`  --obs-border: ${palette.gray ? palette.gray + "66" : "#2a3050"};`);
      vars.push(`  --obs-text: ${palette.white || "#e6eaf0"};`);
      vars.push(`  --obs-muted: ${palette.gray || "#9aa3b8"};`);
      vars.push(`  --obs-code-bg: ${palette.black ? palette.black + "ee" : "#1a2035"};`);
      vars.push(`  --callout-color-note: ${palette.blue || palette.cyan || "#6b8cce"};`);
      vars.push(`  --callout-color-tip: ${palette.green || "#6bcb77"};`);
      vars.push(`  --callout-color-warning: ${palette.yellow || palette.orange || "#ffd166"};`);
      vars.push(`  --callout-color-danger: ${palette.red || "#ff6b6b"};`);
      vars.push(`  --callout-color-question: ${palette.magenta || "#c08bc8"};`);
      vars.push(`  --callout-color-quote: ${palette.cyan || palette.gray || "#88c0d0"};`);
    } else {
      vars.push(`  --bg: ${palette.white || palette.white_dim || "#f5f7fa"};`);
      vars.push(`  --panel: ${palette.white ? (palette.white + "ff") : (palette.white_dim ? (palette.white_dim + "ff") : "#ffffff")};`);
      vars.push(`  --text: ${palette.black || "#1a2332"};`);
      vars.push(`  --muted: ${palette.gray || "#5a6b7b"};`);
      vars.push(`  --border: ${palette.gray ? palette.gray + "66" : "#c8d1e0"};`);
      vars.push(`  --accent: ${palette.blue || palette.cyan || "#2a5ca8"};`);
      vars.push(`  --accent-soft: ${(palette.blue || palette.cyan || "#2a5ca8") + "22"};`);
      vars.push(`  --danger: ${palette.red || "#b42318"};`);
      vars.push(`  --danger-bg: ${(palette.red || "#b42318") + "22"};`);
      vars.push(`  --code-bg: ${palette.white ? (palette.white + "ee") : (palette.white_dim ? (palette.white_dim + "ee") : "#eef3f8")};`);
      vars.push(`  --shadow: 0 18px 50px rgba(40, 33, 23, 0.09);`);
      vars.push(`  --link-color: ${palette.blue || palette.cyan || "#2a5ca8"};`);
      vars.push(`  --obs-canvas: ${palette.white || palette.white_dim || "#f5f7fa"};`);
      vars.push(`  --obs-sidebar: ${palette.white ? (palette.white + "ff") : (palette.white_dim ? (palette.white_dim + "ff") : "#ffffff")};`);
      vars.push(`  --obs-topbar: ${palette.white ? (palette.white + "ee") : (palette.white_dim ? (palette.white_dim + "ee") : "#eef3f8")};`);
      vars.push(`  --obs-border: ${palette.gray ? palette.gray + "66" : "#c8d1e0"};`);
      vars.push(`  --obs-text: ${palette.black || "#1a2332"};`);
      vars.push(`  --obs-muted: ${palette.gray || "#5a6b7b"};`);
      vars.push(`  --obs-code-bg: ${palette.white ? (palette.white + "ee") : (palette.white_dim ? (palette.white_dim + "ee") : "#eef3f8")};`);
      vars.push(`  --callout-color-note: ${palette.blue || palette.cyan || "#3b82f6"};`);
      vars.push(`  --callout-color-tip: ${palette.green || "#16a34a"};`);
      vars.push(`  --callout-color-warning: ${palette.yellow || palette.orange || "#d97706"};`);
      vars.push(`  --callout-color-danger: ${palette.red || "#dc2626"};`);
      vars.push(`  --callout-color-question: ${palette.magenta || "#7c3aed"};`);
      vars.push(`  --callout-color-quote: ${palette.cyan || palette.gray || "#0891b2"};`);
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
