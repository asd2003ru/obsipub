export interface PublicationOptions {
  prefix: string;
  password: string;
  ttl?: string;
  expiresAt?: string;
  showLineNumbers: boolean;
  showArticleLineNumbers?: boolean;
  resetProtection?: boolean;
}

const PREFIX_PATTERN = /^[A-Za-z0-9_-]{0,64}$/;
const PREFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function isValidPublicationPrefix(prefix: string): boolean {
  if (prefix === "") return true;
  return PREFIX_PATTERN.test(prefix) && prefix !== "." && prefix !== "..";
}

export function randomPublicationPrefix(): string {
  const bytes = new Uint8Array(10);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let suffix = "";
  for (const byte of bytes) suffix += PREFIX_ALPHABET[byte % PREFIX_ALPHABET.length];
  return `pub-${suffix}`;
}


export function buildPublicationUploadHeaders(apiKey: string, options: PublicationOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/zip",
    "X-API-Key": apiKey,
    "X-ObsiPub-Prefix": options.prefix,
    "X-ObsiPub-Password": options.password
  };
  if (options.ttl) headers["X-ObsiPub-TTL"] = options.ttl;
  if (options.expiresAt) headers["X-ObsiPub-Expires-At"] = options.expiresAt;
  return headers;
}

export interface PublicationResponse {
  prefix: string;
  expiresAt?: number | null;
}

export function isFutureExpiry(value: string, now = Date.now()): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

export function parsePublicationResponse(value: unknown): PublicationResponse {
  if (typeof value !== "object" || value === null || !("prefix" in value)) {
    throw new Error("server returned an invalid publication response");
  }
  const prefix = (value as { prefix?: unknown }).prefix;
  if (typeof prefix !== "string" || !isValidPublicationPrefix(prefix)) {
    throw new Error("server returned an invalid publication prefix");
  }
  const result: PublicationResponse = { prefix };
  if ("expiresAt" in value) {
    const exp = (value as { expiresAt?: unknown }).expiresAt;
    if (exp === null || exp === undefined) {
      result.expiresAt = null;
    } else if (typeof exp === "number") {
      result.expiresAt = exp > 0 ? exp : null;
    } else {
      const parsed = Number(exp);
      result.expiresAt = !isNaN(parsed) && parsed > 0 ? parsed : null;
    }
  } else {
    result.expiresAt = null;
  }
  return result;
}

export function publicationURL(serverUrl: string, prefix: string): string {
  return `${serverUrl.replace(/\/+$/, "")}/${prefix}`;
}

export function quickAuthPublicationURL(serverUrl: string, prefix: string, password: string): string {
  const url = publicationURL(serverUrl, prefix);
  return `${url}?pwd=${encodeURIComponent(password)}`;
}
