# Omnisend MCP Server

Use the [Omnisend REST API](https://api-docs.omnisend.com/reference/overview) from an MCP compatible AI assistant. This local, open source server connects over stdio and exposes read access plus the documented write operations for contacts, campaigns, automations, segments, analytics, and other Omnisend resources.

> Community project. Not affiliated with or endorsed by Omnisend.

## What it does

| Tool | Purpose |
| --- | --- |
| `omnisend_get` | Read a documented `GET /api/...` endpoint, with optional query parameters. |
| `omnisend_request` | Call a documented `GET`, `POST`, `PUT`, `PATCH`, or `DELETE /api/...` endpoint with JSON, raw base64, or multipart content. This tool can change your account, send campaigns, or delete data. |
| `omnisend_api_guide` | Return the API documentation link and a few starting examples without making a network request. |

The API host is fixed to `https://api.omnisend.com`. The server uses an Omnisend API key and sends `Omnisend-Version: 2026-03-15` by default. Your key's Omnisend permissions determine which operations work. The server does not provide OAuth, a hosted endpoint, or an API key for you.

## Requirements

- [Bun](https://bun.sh/docs/installation) installed locally (tested with Bun 1.4.2).
- An Omnisend account and [API key](https://api-docs.omnisend.com/reference/authentication) with the permissions you need.
- An MCP client that can launch a local stdio server, such as Codex.

## Install

```bash
git clone https://github.com/KhBayazidAhmed/omnisend-mcp-server.git
cd omnisend-mcp-server
bun test
bun run check
```

No package install step is needed; the server uses Bun and built-in web APIs. `dist/` is generated only by the build check and is ignored by Git.

### Set the API key

Set `OMNISEND_API_KEY` in the environment of the app that launches the MCP server. For a one-off terminal session on macOS or Linux, prompt for it without putting the value in shell history:

```bash
read -rs -p 'Omnisend API key: ' OMNISEND_API_KEY
printf '\n'
export OMNISEND_API_KEY
codex
```

The `read` example uses Bash. In zsh, use `read -rs 'OMNISEND_API_KEY?Omnisend API key: '` instead. Other desktop clients must receive the variable through their own launch environment. Never put the key in Git, a tracked `.env` file, an MCP tool argument, or a public issue.

On macOS, you can store the key in Keychain instead. The server tries `OMNISEND_API_KEY` first, then the Keychain service `omnisend-mcp-server`:

```zsh
read -rs 'OMNISEND_API_KEY?Omnisend API key: '
echo
security add-generic-password -a "$USER" -s omnisend-mcp-server -w "$OMNISEND_API_KEY" -U
unset OMNISEND_API_KEY
```

For existing local installations, the old `grabui-omnisend-mcp` Keychain service is also read. A sandboxed client may not be able to access Keychain; launch the client with `OMNISEND_API_KEY` in its environment if needed.

### Connect to Codex

Find your Bun path with `command -v bun` and replace the example paths below with your own absolute paths. In `~/.codex/config.toml`:

```toml
[mcp_servers.omnisend]
command = "/absolute/path/to/bun"
args = ["run", "/absolute/path/to/omnisend-mcp-server/src/server.ts"]
env_vars = ["OMNISEND_API_KEY", "OMNISEND_API_VERSION"]
default_tools_approval_mode = "writes"

[mcp_servers.omnisend.tools.omnisend_request]
approval_mode = "prompt"
```

`omnisend_request` is always prompted in this example, including when called with `GET`. The separate `omnisend_get` tool is marked read-only. Restart Codex, run `codex mcp list`, and ask it to call `omnisend_api_guide`.

You can also register the server from the Codex CLI (without the per-tool approval settings):

```bash
codex mcp add omnisend -- /absolute/path/to/bun run /absolute/path/to/omnisend-mcp-server/src/server.ts
```

Other stdio MCP clients can launch the same command. Configure the API key in the client's process environment or use macOS Keychain.

## Use it

Ask your assistant, for example:

- “Use `omnisend_get` to list my segments from `/api/segments`.”
- “Use `omnisend_get` to list automations from `/api/automations` with `limit=20`.”
- “Show me the Omnisend API guide, then help me prepare a new segment request.”

For a write, first consult the [endpoint documentation](https://api-docs.omnisend.com/reference/overview) for its exact path, permission, and request schema. Review the tool arguments before approving a live change. This server deliberately exposes broad API access, including send and delete operations; it does not validate each endpoint's business rules or add an account-level confirmation step.

The tools return the HTTP status, request URL, content type, response body, and whether the response was truncated. `maxResponseChars` defaults to 200,000 and is capped at 2,000,000. Query parameters belong in `query`, not in `path`. The API documentation describes pagination and cursor parameters for each endpoint.

## Configuration

| Variable | Purpose |
| --- | --- |
| `OMNISEND_API_KEY` | Omnisend API key; preferred over macOS Keychain. |
| `OMNISEND_API_VERSION` | Optional version header override; defaults to `2026-03-15`. |
| `OMNISEND_MCP_DISABLE_KEYCHAIN=1` | Skip macOS Keychain lookup. |

The MCP server runs on your machine. It sends API requests directly to Omnisend and does not need a cloud deployment. Publishing this repository makes the source available; each user runs their own local process and supplies their own key.

## Development

```bash
bun test
bun run check
bun run start
```

`bun run start` waits for newline-delimited MCP JSON-RPC messages on standard input. It is normally launched by an MCP client. Tests mock API calls; they do not access or change an Omnisend account.

## Troubleshooting

- **No API key found:** Forward `OMNISEND_API_KEY` from the client environment, or check the macOS Keychain service name and permissions.
- **401 or 403:** Check the API key, its Omnisend permissions, and the API version required by the endpoint.
- **Tool not visible:** Use `codex mcp list`, check the absolute Bun and server paths, and restart the MCP client.
- **Unexpected request error:** Confirm the path and payload against the [Omnisend API reference](https://api-docs.omnisend.com/reference/overview). Paths must start with `/api/`.

## Security and license

Treat this server as having the same reach as the API key supplied to it. Grant only the Omnisend permissions needed, review write requests, and rotate a key if it is exposed. The server never logs the key or includes it in normal tool results.

MIT licensed. See [LICENSE](LICENSE). Issues and contributions are welcome.
