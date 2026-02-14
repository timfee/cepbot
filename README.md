# Chrome Enterprise Premium MCP Server

An unofficial Model Context Protocol (MCP) server for managing Chrome Enterprise
Premium: browser policies, Data Loss Prevention rules, activity monitoring, and
organizational unit configuration. Built as a Gemini extension for AI-assisted
Chrome enterprise security management.

## Install

```bash
gemini extensions install https://github.com/timfee/cepbot
```

This registers the extension with [Gemini CLI](https://github.com/google-gemini/gemini-cli).
After installation, authenticate with the required scopes (see [Authentication](#authentication))
and start Gemini CLI to begin using the extension.

## Architecture

```
cepbot/
  gemini-extension.json      Extension manifest
  hooks/                     Gemini extension hooks
    hooks.json
    validate-dlp-action.mjs  Blocks BLOCK-mode DLP rules
    dlp-creation-followup.mjs Guides validate-then-create workflow
  mcp-server/
    src/
      index.ts               Entry point (bootstrap, connect stdio)
      lib/                   Core library
        constants.ts          API URLs, scopes, retry config, triggers
        auth.ts               ADC verification and token introspection
        bootstrap.ts          Server initialization sequence
        server-state.ts       Health state (healthy / degraded / booting)
        agent-errors.ts       Structured errors with agent-directive text
        gcp.ts                GCP metadata server detection
        gcloud.ts             gcloud CLI interaction and ADC file access
        projects.ts           Fallback project creation
        apis.ts               API enablement with exponential backoff
        clients.ts            Low-level GCP REST operations
        api/                  Google API clients
          fetch.ts             Authenticated HTTP client (ADC + quota headers)
          admin-sdk.ts         Admin SDK (customer, activity, org units)
          chrome-management.ts Chrome Management (versions, profiles)
          chrome-policy.ts     Chrome Policy (connectors)
          cloud-identity.ts    Cloud Identity (DLP rules, URL lists)
      tools/                 MCP tool definitions
        register.ts           Registers all tools with the server
        schemas.ts            Shared Zod schemas and utilities
        guarded-tool-call.ts  Execution wrapper (auth, validation, errors)
        definitions/          Individual tool implementations
      prompts/               MCP prompt definitions
        register.ts           Registers all prompts with the server
        content.ts            Shared prompt content and builder
        definitions/          Individual prompt implementations
    tests/                   Unit tests (vitest)
    e2e/                     End-to-end tests
```

## Prerequisites

- Node.js >= 20
- [gcloud CLI](https://cloud.google.com/sdk/docs/install)
- Application Default Credentials configured with required scopes
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) (for extension usage)

### Quick Setup

Both scripts install Node.js, gcloud CLI, and Gemini CLI, then walk you through
Google Cloud authentication with the required OAuth scopes.

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/timfee/cepbot/main/setup.sh | bash
```

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/timfee/cepbot/main/setup.ps1 | iex
```

Or clone the repo first and run `./setup.sh` or `.\setup.ps1` locally.

## Development Setup

```bash
npm install
```

This is a workspace monorepo — `npm install` at the root installs all
dependencies. All scripts delegate to the `mcp-server` workspace automatically.

## Scripts

All commands can be run from the repository root:

| Command | Description |
|---|---|
| `npm run build` | Bundle with esbuild, make output executable |
| `npm start` | Run the bundled server (`dist/index.js`) |
| `npm run dev` | Build and launch with MCP Inspector |
| `npm run typecheck` | Type-check without emitting files |
| `npm run check` | Lint and typecheck via Ultracite |
| `npm run fix` | Auto-fix lint issues via Ultracite |
| `npm test` | Run unit tests with coverage |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:e2e` | Run end-to-end tests |

## Build Output

The `mcp-server/dist/` directory is committed to the repository. The Gemini
extension manifest (`gemini-extension.json`) references `dist/index.js` directly,
so consumers get a working server without needing to build from source. CI
automatically rebuilds and commits the bundle on every push to `main`.

## Available Tools

### Read-Only

| Tool | Description |
|---|---|
| `get_customer_id` | Gets the customer ID for the authenticated user |
| `list_org_units` | Lists all organizational units for a customer |
| `list_dlp_rules` | Lists DLP rules or detectors filtered to Chrome triggers |
| `list_customer_profiles` | Lists enrolled browser profiles |
| `get_connector_policy` | Checks connector configuration for one or more org units |
| `get_chrome_activity_log` | Gets Chrome activity logs (defaults to last 10 days) |
| `analyze_chrome_logs_for_risky_activity` | Fetches activity logs scoped for risk analysis |
| `count_browser_versions` | Counts Chrome versions reported by managed devices |

### Mutating

| Tool | Description |
|---|---|
| `create_dlp_rule` | Creates a DLP rule with validate-then-create workflow |
| `create_url_list` | Creates a URL list resource for Chrome policies |

### Destructive

| Tool | Description |
|---|---|
| `delete_dlp_rule` | Permanently deletes a DLP rule by policy name |

### Infrastructure

| Tool | Description |
|---|---|
| `retry_bootstrap` | Re-runs bootstrap after fixing credentials or setup |

## Key Workflows

### Authentication

The server authenticates via Application Default Credentials (ADC). On startup
it verifies gcloud availability, ADC validity, and that the token carries all
required OAuth scopes. If any check fails, the server enters degraded mode and
returns agent-directive errors explaining how to fix the issue.

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/admin.directory.customer.readonly,\
https://www.googleapis.com/auth/admin.directory.orgunit.readonly,\
https://www.googleapis.com/auth/admin.reports.audit.readonly,\
https://www.googleapis.com/auth/chrome.management.policy,\
https://www.googleapis.com/auth/chrome.management.profiles.readonly,\
https://www.googleapis.com/auth/chrome.management.reports.readonly,\
https://www.googleapis.com/auth/cloud-identity.policies,\
https://www.googleapis.com/auth/cloud-platform
```

### Bootstrap Sequence

On startup the server runs: gcloud check, ADC verification, scope validation,
quota project resolution (creating one if needed), API enablement with retry,
and customer ID pre-fetch. If bootstrap fails, the server continues in degraded
mode and tools return the error with recovery instructions.

### DLP Rule Creation

- Check connectors with `get_connector_policy` to verify they are enabled
- Validate the rule with `create_dlp_rule` using `validateOnly: true`
- Create the rule with `create_dlp_rule` without `validateOnly`

Only AUDIT and WARN actions are permitted. BLOCK mode is rejected by both the
extension hooks and the server.

## Environment Variables

No custom environment variables are required. The server reads credentials from
the standard ADC file (`~/.config/gcloud/application_default_credentials.json`)
and detects GCP metadata when running on Google Cloud infrastructure.

## License

Apache-2.0
