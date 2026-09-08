import { strToU8, zipSync } from "fflate";

export interface ArchiveEntry {
  path: string;
  bytes: Uint8Array;
}

/** Rewrite publication metadata as flat YAML properties supported by Obsidian. */
export function rewriteFrontmatterWithObsipub(text: string, obsipubValue: Record<string, unknown>): string {
  const match = text.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)\n([\s\S]*)$/);
  if (!match) return text;
  const lines = match[1].split("\n");
  const cleanedLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^(obsipub_url|obsipub_prefix|obsipub_expire|obsipub_showLineNumbers|obsipub_showArticleLineNumbers|obsipub_protected):/.test(trimmed)) {
      i += 1;
      continue;
    }
    if (/^obsipub:/.test(trimmed)) {
      i += 1;
      while (i < lines.length && (lines[i].trim() === "" || lines[i].startsWith("  ") || lines[i].startsWith("\t"))) i += 1;
      continue;
    }
    cleanedLines.push(line);
    i += 1;
  }
  const flatLines: string[] = [];
  const mapKey = (k: string): string => {
    if (k === "expire") return "obsipub_expire";
    if (k === "showLineNumbers") return "obsipub_showLineNumbers";
    if (k === "showArticleLineNumbers") return "obsipub_showArticleLineNumbers";
    if (k === "protected") return "obsipub_protected";
    if (k === "url") return "obsipub_url";
    if (k === "prefix") return "obsipub_prefix";
    return `obsipub_${k}`;
  };
  for (const [key, value] of Object.entries(obsipubValue)) {
    const mappedKey = mapKey(key);
    if (value === null) flatLines.push(`${mappedKey}: null`);
    else if (typeof value === "boolean") flatLines.push(`${mappedKey}: ${value}`);
    else if (typeof value === "string") flatLines.push(`${mappedKey}: ${value === "" ? '""' : value}`);
    else flatLines.push(`${mappedKey}: ${String(value)}`);
  }
  return `---\n${cleanedLines.concat(flatLines).join("\n")}\n---\n${match[2]}`;
}

/** A Markdown note and its outgoing Markdown dependencies. */
export interface DependencyTreeNode {
  path: string;
  name: string;
  children?: DependencyTreeNode[];
}

/** Exact manifest schema accepted by the publishing server. */
export interface PublishIndex {
  version: 1;
  index: string;
  theme: string;
  showLineNumbers: boolean;
  showArticleLineNumbers?: boolean;
  tree: DependencyTreeNode;
}

/** Sanitize Markdown frontmatter: keep only title and tags, remove everything else (including obsipub), preserve body. */
export function sanitizeMarkdownFrontmatter(bytes: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(bytes).replace(/\r\n?/g, "\n");
  const fmMatch = text.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)\n([\s\S]*)$/);
  if (!fmMatch) {
    return bytes;
  }
  const source = fmMatch[1].split("\n");
  const kept: string[] = [];
  let key = "";
  for (const line of source) {
    const topLevel = line.match(/^([A-Za-z_][\w-]*):(?:\s*(.*))?$/);
    if (topLevel) {
      key = topLevel[1];
      if (key === "title" || key === "tags") kept.push(line);
      continue;
    }
    if (key === "tags" && /^\s*-\s+/.test(line)) kept.push(line);
  }
  if (kept.length === 0) return new TextEncoder().encode(fmMatch[2]);
  return new TextEncoder().encode(`---\n${kept.join("\n")}\n---\n${fmMatch[2]}`);
}

/** Add the exact server index.json manifest to a browser-compatible ZIP archive. */
export function createPublishZip(entries: ArchiveEntry[], index: PublishIndex): Uint8Array {
  const archive: Record<string, Uint8Array> = {};
  for (const entry of entries) archive[entry.path] = entry.bytes;
  archive["index.json"] = strToU8(JSON.stringify(index, null, 2));
  return zipSync(archive, { level: 6 });
}
