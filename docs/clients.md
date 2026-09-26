# Connect an AI tool on macOS, Windows, or Linux

This server works with **local MCP clients that support stdio tools**. Each client starts Bun on the same computer and talks to the process over standard input and output. The Omnisend API key stays in that computer's environment or, on macOS, Keychain.

## 1. Install and find your paths

Install [Git](https://git-scm.com/downloads) and [Bun](https://bun.sh/docs/installation), then clone the repository:

```bash
git clone https://github.com/KhBayazidAhmed/omnisend-mcp-server.git
cd omnisend-mcp-server
bun test
```

You need two **absolute paths** for the examples below: the Bun executable and `src/server.ts` in the cloned repository.

| Device | Bun path | Server path |
| --- | --- | --- |
| macOS or Linux terminal | `command -v bun` | Run `pwd` inside the repository, then append `/src/server.ts`. |
| Windows PowerShell | `(Get-Command bun).Source` | `(Resolve-Path .\src\server.ts).Path` from the repository. |

On Windows, JSON paths can use forward slashes, for example `C:/Users/you/.bun/bin/bun.exe`. Replace every `/absolute/path/...` placeholder below with your paths. Do not copy the placeholder literally.
In client configuration paths, `~` means your home folder on macOS/Linux; on Windows, use `%USERPROFILE%` in File Explorer.

## 2. Supply an Omnisend API key

Create an [Omnisend API key](https://api-docs.omnisend.com/reference/authentication) with only the permissions you need. The server reads `OMNISEND_API_KEY` from its process environment. On macOS it can also read the Keychain service `omnisend-mcp-server`; see the [main guide](../README.md#set-the-api-key).

For terminal-based clients, set the variable before launching the client in the **same terminal**:

```bash
# Bash (macOS or Linux)
read -rs -p 'Omnisend API key: ' OMNISEND_API_KEY
printf '\n'
export OMNISEND_API_KEY
```

```zsh
# zsh (macOS)
read -rs 'OMNISEND_API_KEY?Omnisend API key: '
echo
export OMNISEND_API_KEY
```

```powershell
# PowerShell (Windows)
$secret = Read-Host 'Omnisend API key' -AsSecureString
$env:OMNISEND_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
```

Then launch the AI client from that terminal. A desktop app started from a launcher may **not** inherit terminal variables. Configure its launch environment through your operating system or use macOS Keychain. Never paste an API key into a committed MCP JSON file or this repository.

## 3. Choose your AI client

All JSON examples use a placeholder path. Keep the JSON wrapper used by your client: `mcpServers` and `servers` are different.

### Codex

Follow the [Codex setup in the main README](../README.md#connect-to-codex). It includes a per-tool approval prompt for `omnisend_request`. See the [official Codex MCP guide](https://developers.openai.com/codex/mcp).

### Claude Code

Run this in a terminal with `OMNISEND_API_KEY` set, using your absolute paths:

```bash
claude mcp add --scope user --transport stdio omnisend -- /absolute/path/to/bun run /absolute/path/to/omnisend-mcp-server/src/server.ts
claude mcp list
```

In Claude Code, `/mcp` shows connection status. [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

### Claude Desktop

Open the local MCP configuration from Claude Desktop's developer settings, or edit:

| OS | Configuration file |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Add this entry inside the file's `mcpServers` object and restart Claude Desktop:

```json
{
  "mcpServers": {
    "omnisend": {
      "command": "/absolute/path/to/bun",
      "args": ["run", "/absolute/path/to/omnisend-mcp-server/src/server.ts"]
    }
  }
}
```

The desktop app must receive `OMNISEND_API_KEY` in its launch environment, or use macOS Keychain. If other servers are already configured, add only the `"omnisend"` entry; do not erase them. Check **Connectors** in Claude Desktop after restarting. [Official local MCP guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

### Cursor

Open global `~/.cursor/mcp.json` or project `.cursor/mcp.json`, and add:

```json
{
  "mcpServers": {
    "omnisend": {
      "type": "stdio",
      "command": "/absolute/path/to/bun",
      "args": ["run", "/absolute/path/to/omnisend-mcp-server/src/server.ts"]
    }
  }
}
```

Enable the server in Cursor's MCP settings and check **MCP Logs** if it does not connect. [Cursor MCP documentation](https://prod.cursor.com/docs/mcp).

### VS Code with GitHub Copilot

Run **MCP: Open User Configuration** in the Command Palette for a personal configuration, or use `.vscode/mcp.json` in a workspace. Add:

```json
{
  "servers": {
    "omnisend": {
      "type": "stdio",
      "command": "/absolute/path/to/bun",
      "args": ["run", "/absolute/path/to/omnisend-mcp-server/src/server.ts"]
    }
  }
}
```

Start the server from the MCP configuration editor and allow its tools in chat. [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

### Gemini CLI

Open `~/.gemini/settings.json` (or `.gemini/settings.json` for one project) and add:

```json
{
  "mcpServers": {
    "omnisend": {
      "command": "/absolute/path/to/bun",
      "args": ["run", "/absolute/path/to/omnisend-mcp-server/src/server.ts"],
      "env": { "OMNISEND_API_KEY": "$OMNISEND_API_KEY" }
    }
  }
}
```

Gemini CLI expands `$OMNISEND_API_KEY` from its environment. Launch Gemini from the terminal where you set the variable, then use `/mcp` to check the server. [Gemini CLI MCP documentation](https://geminicli.com/docs/tools/mcp-server/).

### Another desktop or CLI client

Choose **local/stdio MCP server** and supply:

- Command: the absolute path to `bun` or `bun.exe`.
- Arguments: `run` and the absolute path to `src/server.ts`.
- Environment: `OMNISEND_API_KEY` in the client's process, or macOS Keychain.

Ask the client to call `omnisend_api_guide` first. Then try `omnisend_get` with `{"path":"/api/segments"}`. No API request is made by the guide tool. The segments request does call your Omnisend account.

## Phones, tablets, web-only tools, and remote sessions

This repository provides a **local stdio process**, not a hosted MCP URL. A phone app, browser-only AI tool, or remote agent cannot connect to the process just by using the GitHub URL. Use a supported desktop or CLI client on macOS, Windows, or Linux. A future remote HTTP deployment would need its own authentication and hosting design.

For a client running inside a remote VM or container, install Bun and clone this repository **in that environment**, then provide the key there. A local path on your laptop is not accessible to a remote client.

## Common problems

| Symptom | Check |
| --- | --- |
| Server does not start | Verify both absolute paths, Bun installation, and that the client supports stdio MCP. |
| “No Omnisend API key found” | Make sure the key reaches the **server process**. A variable in a separate terminal is not enough. |
| 401 or 403 from Omnisend | Check key validity and permissions. |
| Tool appears but a write fails | Check the exact path, method, and body against the [Omnisend API reference](https://api-docs.omnisend.com/reference/overview). |

`omnisend_request` can send campaigns or delete data. Review each write in your AI client before approving it.
