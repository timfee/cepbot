# Tool Definitions

Individual MCP tool implementations. Each file exports a single
`register<Name>Tool(server)` function.

## Tools

### Read-Only

| File | Tool Name | Description |
|---|---|---|
| `get-customer-id.ts` | `get_customer_id` | Returns the authenticated user's customer ID |
| `list-org-units.ts` | `list_org_units` | Lists all organizational units |
| `list-dlp-rules.ts` | `list_dlp_rules` | Lists DLP rules filtered to Chrome triggers |
| `list-customer-profiles.ts` | `list_customer_profiles` | Lists enrolled browser profiles |
| `get-connector-policy.ts` | `get_connector_policy` | Checks connector config for org units |
| `get-chrome-activity-log.ts` | `get_chrome_activity_log` | Gets activity logs (default: last 10 days) |
| `analyze-chrome-logs.ts` | `analyze_chrome_logs_for_risky_activity` | Activity logs scoped for risk analysis |
| `count-browser-versions.ts` | `count_browser_versions` | Counts Chrome versions on managed devices |

### Mutating

| File | Tool Name | Description |
|---|---|---|
| `create-dlp-rule.ts` | `create_dlp_rule` | Creates a DLP rule (supports `validateOnly`) |
| `create-url-list.ts` | `create_url_list` | Creates a URL list for Chrome policies |

### Destructive

| File | Tool Name | Description |
|---|---|---|
| `delete-dlp-rule.ts` | `delete_dlp_rule` | Permanently deletes a DLP rule |

### Infrastructure

| File | Tool Name | Description |
|---|---|---|
| `retry-bootstrap.ts` | `retry_bootstrap` | Re-runs bootstrap (registered separately in `index.ts`) |

## Adding a New Tool

1. Create `<tool-name>.ts` in this directory with a `register<Name>Tool(server)` export.
2. Use `guardedToolCall()` from `../guarded-tool-call` for standard error handling.
3. Define input schemas with Zod using shared schemas from `../schemas`.
4. Add the registration call to `../register.ts`.
5. Add MCP tool annotations (`readOnlyHint`, `destructiveHint`, etc.).
6. Write unit tests in `tests/tools/definitions/`.
