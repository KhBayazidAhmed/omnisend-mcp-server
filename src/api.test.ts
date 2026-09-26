import { describe, expect, test } from "bun:test";
import { apiUrl, omnisendRequest } from "./api.ts";

describe("Omnisend API URL", () => {
  test("keeps requests on the Omnisend API host and encodes query values", () => {
    expect(apiUrl("/api/automations", { limit: 20, tag: ["one", "two"] }).toString())
      .toBe("https://api.omnisend.com/api/automations?limit=20&tag=one&tag=two");
  });

  test("rejects arbitrary hosts and traversal", () => {
    for (const path of ["https://example.com/api/contacts", "//example.com/api/contacts", "/api/../admin", "/api/%2e%2e/admin", "/api/contacts?token=x"]) {
      expect(() => apiUrl(path)).toThrow();
    }
  });
});

test("write requests use the Omnisend key and version without exposing the key in results", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OMNISEND_API_KEY;
  process.env.OMNISEND_API_KEY = "local-test-key";
  let seen: { url: string; method: string; auth: string | null; version: string | null; body: string } | undefined;
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    seen = {
      url: String(input), method: init?.method ?? "", auth: headers.get("Authorization"),
      version: headers.get("Omnisend-Version"), body: String(init?.body),
    };
    return new Response(JSON.stringify({ id: "example" }), { status: 201, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await omnisendRequest({ method: "POST", path: "/api/segments", body: { name: "Example" } });
    expect(seen).toEqual({
      url: "https://api.omnisend.com/api/segments", method: "POST", auth: "Omnisend-API-Key local-test-key",
      version: "2026-03-15", body: '{"name":"Example"}',
    });
    expect(result.status).toBe(201);
    expect(JSON.stringify(result)).not.toContain("local-test-key");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OMNISEND_API_KEY;
    else process.env.OMNISEND_API_KEY = originalKey;
  }
});

test("MCP initializes and exposes full API tools without an API key", async () => {
  const child = Bun.spawn(["bun", "run", "src/server.ts"], {
    cwd: import.meta.dir.replace(/\/src$/, ""),
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...Bun.env, OMNISEND_API_KEY: "", OMNISEND_MCP_DISABLE_KEYCHAIN: "1" },
  });
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "omnisend_get", arguments: { path: "/api/automations" } } },
  ];
  child.stdin.write(messages.map((message) => JSON.stringify(message)).join("\n") + "\n");
  child.stdin.end();
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(0);
  const responses = output.trim().split("\n").map((line) => JSON.parse(line));
  expect(responses).toHaveLength(3);
  expect(responses[0].result.capabilities.tools).toBeDefined();
  expect(responses[1].result.tools.map((tool: { name: string }) => tool.name))
    .toEqual(["omnisend_get", "omnisend_request", "omnisend_api_guide"]);
  expect(responses[2].result.isError).toBe(true);
  expect(responses[2].result.content[0].text).toContain("No Omnisend API key found");
});
