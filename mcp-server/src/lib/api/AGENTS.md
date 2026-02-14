# Google API Clients

Typed wrappers around Google REST APIs used by the MCP server tools.

## Modules

| File | APIs | Key Functions |
|---|---|---|
| `fetch.ts` | (shared) | `authenticatedFetch()` — ADC-based HTTP client with quota project header |
| `admin-sdk.ts` | Admin SDK Directory & Reports | `getCustomerId()`, `listOrgUnits()`, `listChromeActivities()` |
| `chrome-management.ts` | Chrome Management | `countBrowserVersions()`, `listCustomerProfiles()` |
| `chrome-policy.ts` | Chrome Policy | `getConnectorPolicy()` with schema-based filtering |
| `cloud-identity.ts` | Cloud Identity | `listDlpPolicies()`, `createDlpRule()`, `deleteDlpRule()`, `createUrlList()` |

## Conventions

- All HTTP requests go through `authenticatedFetch()` which handles ADC tokens
  and sets the `x-goog-user-project` quota header.
- Functions accept an optional `authToken` parameter; when omitted, ADC
  credentials are used automatically.
- Response types are defined locally in each module, not shared globally.
- URL construction uses the base URLs from `@lib/constants`.
