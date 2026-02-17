# CLI Testing Guide

How to test the CEP MCP Server end-to-end from your terminal — on macOS,
Linux, or Windows.

## Quick start

```bash
# Unit tests (mocked, no credentials needed)
npm test

# E2E API tests (real Google APIs, needs ADC)
npm run test:e2e

# Manual MCP inspector (browser UI)
npm run dev

# Raw JSON-RPC over stdio
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

## Prerequisites

### 1. gcloud CLI

The server needs the gcloud CLI for authentication and quota project
management.

**macOS/Linux:**

```bash
# Install
curl https://sdk.cloud.google.com | bash

# Verify
gcloud --version
```

**Windows:**

```powershell
# Install via winget (recommended)
winget install Google.CloudSDK

# IMPORTANT: close and re-open your terminal after install.
# If gcloud is still not found, the server will check these locations:
#   %LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin
#   %ProgramFiles%\Google\Cloud SDK\google-cloud-sdk\bin
#   %ProgramFiles(x86)%\Google\Cloud SDK\google-cloud-sdk\bin
#   %PROGRAMW6432%\Google\Cloud SDK\google-cloud-sdk\bin

# Verify
gcloud --version
```

### 2. Application Default Credentials

The server authenticates using ADC. You need a Workspace admin account on
your test domain.

```bash
gcloud auth application-default login \
  --scopes=openid,\
https://www.googleapis.com/auth/userinfo.email,\
https://www.googleapis.com/auth/cloud-platform,\
https://www.googleapis.com/auth/admin.directory.customer.readonly,\
https://www.googleapis.com/auth/admin.directory.orgunit.readonly,\
https://www.googleapis.com/auth/admin.reports.audit.readonly,\
https://www.googleapis.com/auth/chrome.management.policy,\
https://www.googleapis.com/auth/chrome.management.reports.readonly,\
https://www.googleapis.com/auth/chrome.management.profiles.readonly,\
https://www.googleapis.com/auth/cloud-identity.policies
```

This writes `application_default_credentials.json` to:

| Platform      | Path                                                    |
| ------------- | ------------------------------------------------------- |
| macOS / Linux | `~/.config/gcloud/application_default_credentials.json` |
| Windows       | `%APPDATA%\gcloud\application_default_credentials.json` |

### 3. Quota project

The server needs a GCP project for API quota billing. Bootstrap handles this
automatically, but if you want to set it manually:

```bash
gcloud auth application-default set-quota-project <your-project-id>
```

If this command fails (common on Windows), the server writes the
`quota_project_id` field directly into the ADC JSON file as a fallback. You
can verify it's set:

```bash
# macOS/Linux
cat ~/.config/gcloud/application_default_credentials.json | grep quota_project_id

# Windows (PowerShell)
Get-Content "$env:APPDATA\gcloud\application_default_credentials.json" | Select-String quota_project_id
```

### 4. Build the server

```bash
npm run build
```

This creates `dist/index.js` — a single-file ESM bundle that runs on
Node 20+.

## Testing methods

### Method 1: Automated E2E tests (vitest)

The fastest way to validate that the API clients work against real Google
APIs. No MCP protocol involved — tests import the API client functions
directly and call them with real credentials.

```bash
npm run test:e2e
```

**What it tests:**

| File                            | APIs covered                                            |
| ------------------------------- | ------------------------------------------------------- |
| `admin-sdk.e2e.ts`              | `getCustomerId`, `listOrgUnits`, `listChromeActivities` |
| `admin-sdk.e2e.test.ts`         | Same APIs with auto-resolved customer ID                |
| `chrome-management.e2e.ts`      | `countBrowserVersions`, `listCustomerProfiles`          |
| `chrome-management.e2e.test.ts` | Same with error tolerance for missing scope             |
| `chrome-policy.e2e.ts`          | `getConnectorPolicy` with all schema filter values      |
| `chrome-policy.e2e.test.ts`     | Wildcard connector policy resolution                    |
| `cloud-identity.e2e.test.ts`    | `listDlpPolicies`, `createDlpRule` (validate-only)      |
| `dlp-rules.e2e.ts`              | Ground-truth DLP filter validation                      |

**What it does NOT test:**

- The MCP JSON-RPC protocol layer
- The bootstrap sequence (gcloud checks, API enablement)
- The `guardedToolCall` wrapper (customer ID caching, org unit normalization)
- Tool registration and parameter schemas
- Degraded mode and `retry_bootstrap`

For those, use methods 2–4 below.

### Method 2: MCP Inspector (browser UI)

The MCP Inspector gives you a visual interface to call tools and see
responses.

```bash
npm run dev
```

This builds the server, then launches the
[MCP Inspector](https://github.com/modelcontextprotocol/inspector) which
opens a browser tab. From there you can:

1. See all registered tools and their schemas
2. Call any tool with custom parameters
3. See the raw JSON-RPC request/response
4. View server logs and notifications

**Testing the bootstrap flow:**

The server bootstraps automatically when it starts. Watch the terminal output
for:

```
[server] [info] Checking gcloud installation...
[server] [info] Resolving project and region...
[server] [info] Quota project resolved: my-project (region: us-central1)
[server] [info] Enabling required APIs...
[server] [info] Prefetching customer ID...
```

If bootstrap fails, you'll see:

```
[bootstrap] ✗ <error message>
cep-mcp-server running in DEGRADED mode on stdio
```

In degraded mode, all tools except `retry_bootstrap` return an error. Use the
Inspector to call `retry_bootstrap` and verify recovery.

**Testing each tool:**

| Tool                                     | Params to try                                | What to verify                                             |
| ---------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `get_customer_id`                        | (none)                                       | Returns your Workspace customer ID (e.g. `C01b1e65b`)      |
| `list_org_units`                         | (none — auto-resolves customer ID)           | Returns array of org units with names and paths            |
| `count_browser_versions`                 | (none)                                       | Returns browser version counts (may be empty)              |
| `list_customer_profiles`                 | (none)                                       | Returns managed browser profiles (may be empty)            |
| `list_dlp_rules`                         | (none)                                       | Returns Chrome DLP rules filtered to Chrome triggers       |
| `get_chrome_activity_log`                | `userKey: "all"`                             | Returns activity events (last 10 days by default)          |
| `analyze_chrome_logs_for_risky_activity` | `userKey: "all"`                             | Returns same events, intended for AI analysis              |
| `get_connector_policy`                   | `policy: "ALL"`, `orgUnitId: "<from list>`   | Returns connector config status per org unit               |
| `create_dlp_rule`                        | `validateOnly: true`, minimal params         | Validates rule creation without persisting                 |
| `delete_dlp_rule`                        | `policyName: "policies/..."` (test resource) | Deletes the policy — **destructive**, use a throwaway rule |
| `create_url_list`                        | `displayName`, `urls`, `orgUnitId`           | Creates a URL list for Chrome policies                     |
| `retry_bootstrap`                        | (none)                                       | Re-runs bootstrap; useful after fixing credentials         |

### Method 3: Raw JSON-RPC over stdio

For scripted testing or debugging, you can send JSON-RPC messages directly to
the server's stdin and read responses from stdout. The server uses the MCP
protocol over stdio (newline-delimited JSON-RPC 2.0).

**List all tools:**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js 2>/dev/null
```

**Call a tool:**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_customer_id","arguments":{}}}' \
  | node dist/index.js 2>/dev/null
```

**Multi-step session** (using a FIFO for bidirectional communication):

```bash
# Create a named pipe
mkfifo /tmp/mcp-pipe

# Start the server reading from the pipe
node dist/index.js < /tmp/mcp-pipe 2>/dev/null &
SERVER_PID=$!

# Send messages to the pipe
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' > /tmp/mcp-pipe
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_customer_id","arguments":{}}}' > /tmp/mcp-pipe

# Clean up
kill $SERVER_PID 2>/dev/null
rm /tmp/mcp-pipe
```

**Windows (PowerShell):**

```powershell
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js 2>$null
```

### Method 4: Real MCP client

The most realistic test — connect the server to an actual MCP-aware client.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cep-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

Config file location:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

After saving, restart Claude Desktop. The CEP MCP Server tools should appear in the
tools menu.

**Gemini CLI:**

Follow the
[Gemini CLI MCP setup](https://github.com/google-gemini/gemini-cli/blob/main/docs/mcp.md)
to add the server to your Gemini CLI configuration.

## Troubleshooting

### Bootstrap failures

| Symptom                                          | Cause                                       | Fix                                                                                 |
| ------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `gcloud CLI is not installed`                    | gcloud not on PATH                          | Install gcloud; on Windows, restart terminal after install                          |
| `Could not load the default credentials`         | No ADC file                                 | Run `gcloud auth application-default login` with all required scopes                |
| `Request had insufficient authentication scopes` | ADC missing scopes                          | Re-run `gcloud auth application-default login` with the full scopes list above      |
| `API requires a quota project`                   | No quota_project_id in ADC                  | Run `gcloud auth application-default set-quota-project <project>`                   |
| `API [X] is not enabled`                         | Required API not enabled on the GCP project | Bootstrap enables APIs automatically; if it fails, enable manually in Cloud Console |
| `RESOURCE_EXHAUSTED` (429)                       | Rate limit on Cloud Identity v1beta1        | Wait 30 seconds and retry; the server uses exponential backoff internally           |
| `Permission denied`                              | Account lacks Workspace admin role          | Use a super admin account or grant specific admin roles                             |

### Windows-specific issues

**gcloud not found after install:**

The server checks well-known install paths automatically
(`%LOCALAPPDATA%`, `%ProgramFiles%`, etc.) when gcloud isn't on PATH. If it
finds `gcloud.cmd`, it prepends the directory to `PATH` and retries. You
should see this in the bootstrap output:

```
[server] [info] Checking gcloud installation...
```

If it still fails, add the gcloud `bin` directory to your PATH manually:

```powershell
$env:PATH = "C:\Users\<you>\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin;$env:PATH"
```

**`set-quota-project` fails silently:**

Common when gcloud is found via PATH fallback but has configuration issues.
The server handles this by writing `quota_project_id` directly into the ADC
JSON file. If even that fails, check that the ADC file exists and is writable.

**Line endings in ADC file:**

If you edit the ADC JSON file manually on Windows, ensure it stays valid JSON.
Use `jq .` or `python -m json.tool` to verify:

```powershell
Get-Content "$env:APPDATA\gcloud\application_default_credentials.json" | python -m json.tool
```

### Degraded mode

When bootstrap fails, the server starts in degraded mode. All tools except
`retry_bootstrap` return an error explaining what went wrong. To recover:

1. Fix the underlying issue (install gcloud, refresh ADC, etc.)
2. Call the `retry_bootstrap` tool (via Inspector, JSON-RPC, or MCP client)
3. The server clears all cached credentials and re-runs bootstrap
4. If successful, all tools become available immediately

### Verifying the fix worked

After fixing credentials or quota project issues, the fastest verification
path is:

```bash
# 1. Rebuild
npm run build

# 2. Quick smoke test — list tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js 2>/dev/null

# 3. Call a simple read-only tool
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_customer_id","arguments":{}}}' \
  | node dist/index.js 2>/dev/null

# 4. Run the full E2E suite
npm run test:e2e
```

If step 3 returns your customer ID, the authentication, quota project, and
API enablement are all working.

## Test coverage

Unit tests enforce 100% coverage across all four V8 metrics (statements,
branches, functions, lines). The coverage thresholds are configured in
`vitest.config.ts` — `npm test` fails if any metric drops below 100%.

Coverage is measured on all files in `src/` except the entry point
(`src/index.ts`), which is excluded because it boots the MCP server on import
and can't be tested without a real stdio transport.

```bash
# Run with coverage report
npm test

# Watch mode (no coverage, faster feedback)
npm run test:watch
```

The e2e tests (`npm run test:e2e`) are excluded from coverage metrics. They
validate API correctness against real Google endpoints, not code path
coverage.
