# End-to-End Tests

Integration tests that call real Google APIs. These require valid Application
Default Credentials and a configured test environment.

## Running

```bash
npm run test:e2e
```

## Prerequisites

- ADC configured with all required OAuth scopes
- A known DLP rule must exist in the test environment
- At least one organizational unit must exist
- A quota project may be needed if rate-limited

## Test Files

| File | Scope |
|---|---|
| `admin-sdk.e2e.test.ts` | `getCustomerId`, `listOrgUnits`, `listChromeActivities` |
| `chrome-management.e2e.test.ts` | `countBrowserVersions`, `listCustomerProfiles` |
| `chrome-policy.e2e.test.ts` | `getConnectorPolicy` with all schema filters |
| `cloud-identity.e2e.test.ts` | DLP policy listing and filtering |
| `dlp-rules.e2e.ts` | DLP rule filtering with ground-truth validation |

## Test Pattern

Tests use a **ground-truth comparison** pattern:
1. Direct GET fetches a specific known resource (always succeeds)
2. Filtered list query tests constructed filters
3. Comparison verifies the known resource appears in filtered results

## Configuration

- `fixtures.ts` — Environment-specific values (domain, customer ID, known DLP rule)
- `helpers.ts` — Test utilities
- `vitest.config.ts` — E2E-specific config (30s timeout)
