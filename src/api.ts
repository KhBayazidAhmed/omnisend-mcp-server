import { userInfo } from "node:os";

const API_ORIGIN = "https://api.omnisend.com";
const DEFAULT_VERSION = "2026-03-15";
const KEYCHAIN_SERVICES = ["omnisend-mcp-server", "grabui-omnisend-mcp"];
let cachedKey: string | undefined;

export type QueryValue = string | number | boolean | null | Array<string | number | boolean | null>;

export type RequestArguments = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  rawBodyBase64?: string;
  contentType?: string;
  multipart?: {
    fields?: Record<string, string>;
    files?: Array<{ field: string; filename: string; mimeType?: string; base64: string }>;
  };
  maxResponseChars?: number;
};

function apiKey(): string | undefined {
  if (process.env.OMNISEND_API_KEY) return process.env.OMNISEND_API_KEY;
  if (cachedKey) return cachedKey;
  if (process.platform !== "darwin" || process.env.OMNISEND_MCP_DISABLE_KEYCHAIN === "1") return undefined;
  for (const service of KEYCHAIN_SERVICES) {
    const result = Bun.spawnSync({
      cmd: ["security", "find-generic-password", "-a", userInfo().username, "-s", service, "-w"],
      stdout: "pipe", stderr: "pipe",
    });
    if (result.exitCode === 0) {
      cachedKey = new TextDecoder().decode(result.stdout).trim() || undefined;
      if (cachedKey) return cachedKey;
    }
  }
  return undefined;
}

export function apiUrl(path: string, query?: Record<string, QueryValue>): URL {
  if (typeof path !== "string" || !path.startsWith("/api/")) {
    throw new Error("path must start with /api/");
  }
  if (path.includes("?") || path.includes("#") || path.includes("\\")) {
    throw new Error("put query parameters in query, not path");
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new Error("path contains invalid percent encoding");
  }
  if (decoded.split("/").some((part) => part === "." || part === "..") || decoded.includes("\\")) {
    throw new Error("path traversal is not allowed");
  }
  const url = new URL(path, API_ORIGIN);
  if (url.origin !== API_ORIGIN || !url.pathname.startsWith("/api/")) {
    throw new Error("request must stay on the Omnisend API host");
  }
  for (const [key, value] of Object.entries(query ?? {})) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== null && item !== undefined) url.searchParams.append(key, String(item));
    }
  }
  return url;
}

function requestBody(args: RequestArguments, headers: Headers): BodyInit | undefined {
  const selected = [args.body !== undefined, args.rawBodyBase64 !== undefined, args.multipart !== undefined].filter(Boolean);
  if (selected.length > 1) throw new Error("provide only one of body, rawBodyBase64, or multipart");

  if (args.multipart !== undefined) {
    const form = new FormData();
    for (const [key, value] of Object.entries(args.multipart.fields ?? {})) form.append(key, value);
    for (const file of args.multipart.files ?? []) {
      const bytes = Buffer.from(file.base64, "base64");
      form.append(file.field, new Blob([bytes], { type: file.mimeType ?? "application/octet-stream" }), file.filename);
    }
    return form;
  }
  if (args.rawBodyBase64 !== undefined) {
    if (!args.contentType) throw new Error("contentType is required with rawBodyBase64");
    headers.set("Content-Type", args.contentType);
    return Buffer.from(args.rawBodyBase64, "base64");
  }
  if (args.body !== undefined) {
    headers.set("Content-Type", "application/json");
    return JSON.stringify(args.body);
  }
  return undefined;
}

export async function omnisendRequest(args: RequestArguments): Promise<{ status: number; ok: boolean; url: string; contentType: string; body: unknown; truncated: boolean }> {
  const key = apiKey();
  if (!key) throw new Error("No Omnisend API key found in OMNISEND_API_KEY or macOS Keychain service omnisend-mcp-server");
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(args.method)) throw new Error("unsupported HTTP method");
  const url = apiUrl(args.path, args.query);
  const headers = new Headers({
    "Accept": "application/json",
    "Authorization": `Omnisend-API-Key ${key}`,
    "Omnisend-Version": process.env.OMNISEND_API_VERSION || DEFAULT_VERSION,
  });
  const body = requestBody(args, headers);
  if (args.method === "GET" && body !== undefined) throw new Error("GET requests cannot have a body");

  const response = await fetch(url, { method: args.method, headers, body, signal: AbortSignal.timeout(60_000) });
  const contentType = response.headers.get("content-type") ?? "";
  const limit = Math.min(Math.max(args.maxResponseChars ?? 200_000, 1_000), 2_000_000);
  const raw = await response.text();
  const truncated = raw.length > limit;
  const visible = truncated ? raw.slice(0, limit) : raw;
  let parsed: unknown = visible;
  if (!truncated && contentType.includes("json") && visible) {
    try { parsed = JSON.parse(visible); } catch { /* Return the original text. */ }
  }
  return { status: response.status, ok: response.ok, url: url.toString(), contentType, body: parsed, truncated };
}
