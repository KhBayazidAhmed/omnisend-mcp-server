import { createInterface } from "node:readline";
import { omnisendRequest, type RequestArguments } from "./api.ts";

type RpcRequest = { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> };
const VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = new Set(["2024-11-05", "2025-03-26", VERSION]);

const tools = [
  {
    name: "omnisend_get",
    title: "Read Omnisend API",
    description: "Read any Omnisend REST API endpoint. Supply its /api/... path and optional query parameters. Supports pagination via query cursors. See https://api-docs.omnisend.com/v2026-03-15/reference/ for endpoint paths.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: "object", required: ["path"], additionalProperties: false,
      properties: {
        path: { type: "string", description: "Omnisend path beginning /api/" },
        query: { type: "object", additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }, { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }] } }] } },
        maxResponseChars: { type: "integer", minimum: 1000, maximum: 2000000 },
      },
    },
  },
  {
    name: "omnisend_request",
    title: "Call any Omnisend API operation",
    description: "Call any Omnisend REST endpoint, including creating, updating, sending, enabling, disabling, and deleting. Use the exact method and /api/... path from Omnisend API docs. Supports JSON, raw base64, or multipart bodies. This tool can change the live account; inspect the target and request before use.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    inputSchema: {
      type: "object", required: ["method", "path"], additionalProperties: false,
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string", description: "Omnisend path beginning /api/" },
        query: { type: "object", additionalProperties: true },
        body: { description: "JSON request body; do not combine with multipart or rawBodyBase64" },
        rawBodyBase64: { type: "string", description: "Base64-encoded non-JSON request body" },
        contentType: { type: "string", description: "Required with rawBodyBase64" },
        multipart: {
          type: "object", additionalProperties: false,
          properties: {
            fields: { type: "object", additionalProperties: { type: "string" } },
            files: { type: "array", items: { type: "object", required: ["field", "filename", "base64"], properties: { field: { type: "string" }, filename: { type: "string" }, mimeType: { type: "string" }, base64: { type: "string" } } } },
          },
        },
        maxResponseChars: { type: "integer", minimum: 1000, maximum: 2000000 },
      },
    },
  },
  {
    name: "omnisend_api_guide",
    title: "Omnisend API guide",
    description: "Get API documentation links and examples for this bridge. Does not contact Omnisend.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id: string | number, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function failure(id: string | number, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(request: RpcRequest): Promise<void> {
  const { id, method, params = {} } = request;
  if (id === undefined) return; // MCP notifications have no response.
  if (method === "initialize") {
    const requested = params.protocolVersion;
    success(id, {
      protocolVersion: typeof requested === "string" && SUPPORTED_VERSIONS.has(requested) ? requested : VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "omnisend-mcp-server", version: "1.0.0" },
      instructions: "Use omnisend_get for reads. Use omnisend_request for all other Omnisend API methods; it can change or send from the live account. The host is fixed to api.omnisend.com. Consult omnisend_api_guide and the official API docs for operation paths and payloads.",
    });
    return;
  }
  if (method === "ping") { success(id, {}); return; }
  if (method === "tools/list") { success(id, { tools }); return; }
  if (method !== "tools/call") { failure(id, -32601, `Method not found: ${method}`); return; }

  const name = params.name;
  const args = params.arguments;
  if (typeof name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) {
    failure(id, -32602, "tools/call requires name and object arguments"); return;
  }
  try {
    if (name === "omnisend_api_guide") {
      success(id, { content: [{ type: "text", text: JSON.stringify({
        docs: "https://api-docs.omnisend.com/v2026-03-15/reference/",
        authentication: "Uses the local OMNISEND_API_KEY environment variable; never pass the key as a tool argument.",
        capabilities: "Any documented /api/ REST endpoint, any of GET/POST/PUT/PATCH/DELETE; JSON, raw, and multipart bodies.",
        examples: [
          { tool: "omnisend_get", arguments: { path: "/api/automations", query: { limit: 20 } } },
          { tool: "omnisend_get", arguments: { path: "/api/segments" } },
          { tool: "omnisend_request", arguments: { method: "POST", path: "/api/analytics/reports", body: { /* See API docs for report payload. */ } } },
        ],
      }, null, 2) }] });
      return;
    }
    if (name !== "omnisend_get" && name !== "omnisend_request") {
      failure(id, -32602, `Unknown tool: ${name}`); return;
    }
    const input = args as Record<string, unknown>;
    const requestArgs = name === "omnisend_get"
      ? { ...input, method: "GET" } as RequestArguments
      : input as RequestArguments;
    if (name === "omnisend_get" && ("body" in input || "multipart" in input || "rawBodyBase64" in input)) {
      throw new Error("omnisend_get does not accept a request body");
    }
    const result = await omnisendRequest(requestArgs);
    success(id, { isError: !result.ok, content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (error) {
    success(id, { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] });
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (!line.trim()) continue;
  let request: RpcRequest;
  try { request = JSON.parse(line) as RpcRequest; }
  catch { failure(0, -32700, "Parse error"); continue; }
  if (request?.jsonrpc !== "2.0" || typeof request.method !== "string") {
    if (request?.id !== undefined) failure(request.id, -32600, "Invalid Request");
    continue;
  }
  await handle(request);
}
