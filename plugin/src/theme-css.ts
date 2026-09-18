import webCss from "../../web/src/style.css";
import classicCss from "../../internal/web/themes/classic.css";
import contrastCss from "../../internal/web/themes/contrast.css";

export const webBaseCss = String(webCss || "");

export const builtInThemes: Record<string, string> = {
  classic: String(classicCss || ""),
  contrast: String(contrastCss || "")
};
