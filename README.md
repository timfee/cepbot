# Chrome Enterprise Premium MCP Server

A Gemini extension for managing Chrome Enterprise Premium: browser policies,
Data Loss Prevention rules, activity monitoring, and organizational unit
configuration.

## Architecture

```
cepbot/
  AGENTS.md                  Code standards (Ultracite)
  GEMINI.md                  Gemini CLI system prompt
  gemini-extension.json      Extension manifest
  hooks/                     Gemini extension hooks
    hooks.json
    validate-dlp-action.mjs  Blocks BLOCK-mode DLP rules
    dlp-creation-followup.mjs Guides validate-then-create workflow
  mcp-server/
    src/
      index.ts               Entry point
      lib/                   Core library
        constants.ts          Shared configuration
        auth.ts               ADC verification
        bootstrap.ts          Server initialization
        gcp.ts                GCP metadata detection
        gcloud.ts             gcloud CLI interaction
        projects.ts           Project creation fallback
        apis.ts               API enablement with retry
        clients.ts            Low-level GCP operations
        api/                  Google API clients
          fetch.ts             Authenticated HTTP client
          admin-sdk.ts         Admin SDK (customer, activity, org units)
          chrome-management.ts Chrome Management (versions, profiles)
          chrome-policy.ts     Chrome Policy (connectors)
          cloud-identity.ts    Cloud Identity (DLP, URL lists)
      tools/                 MCP tool definitions
        register.ts
        schemas.ts
        guarded-tool-call.ts
        definitions/          11 individual tools
      prompts/               MCP prompt definitions
        register.ts
        content.ts
        definitions/          4 prompts
```

## Prerequisites

- Node.js >= 18
- [gcloud CLI](https://cloud.google.com/sdk/docs/install)
- Application Default Credentials configured with required scopes
- [Gemini CLI](https://github.com/GoogleCloudPlatform/gemini-cli) (for extension
  usage)

## Development

```bash
cd mcp-server
npm install
npm run build      # Bundle with esbuild
npm run typecheck   # Type-check without emitting
npm run check       # Lint + typecheck (ultracite)
npm run fix         # Auto-fix lint issues
npm test            # Run unit tests with coverage
npm run test:e2e    # Run end-to-end tests
```

## Available Tools

### Read-Only

| Tool | Purpose |
|---|---|
| `get_customer_id` | Gets the customer ID for the authenticated user |
| `list_org_units` | Lists all organizational units for a customer |
| `list_dlp_rules` | Lists DLP rules or detectors |
| `list_customer_profiles` | Lists all customer browser profiles |
| `get_connector_policy` | Checks Chrome Enterprise connector configuration |
| `get_chrome_activity_log` | Gets Chrome browser activity logs |
| `analyze_chrome_logs_for_risky_activity` | Analyzes activity logs for risky behavior |
| `count_browser_versions` | Counts Chrome browser versions reported by devices |

### Mutating

| Tool | Purpose |
|---|---|
| `create_dlp_rule` | Creates a DLP rule for a specific organizational unit |
| `create_url_list` | Creates a new URL list for Chrome policies |

### Destructive

| Tool | Purpose |
|---|---|
| `delete_dlp_rule` | Permanently deletes a DLP rule |

## Key Workflows

### Bootstrap Sequence

On startup the server verifies gcloud CLI availability, ADC credentials,
required OAuth scopes, resolves a quota project (creating one if needed),
enables required Google APIs, and pre-fetches the customer ID.

### DLP Rule Creation

1. Check connectors with `get_connector_policy` to verify they are enabled
2. Validate the rule with `create_dlp_rule` using `validateOnly: true`
3. Create the rule with `create_dlp_rule` without `validateOnly`

Only AUDIT and WARN actions are permitted. BLOCK mode is rejected by both the
extension hooks and the server.

## Naming

- **Chrome Enterprise Premium** — the Google product name
- **chrome-enterprise-premium** — Gemini extension identifier
- **cepbot** — npm package name and internal shorthand

## License

Apache-2.0
