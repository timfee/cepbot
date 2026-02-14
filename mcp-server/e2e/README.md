# E2E Tests

These tests hit the real Google APIs with real credentials. They exist because
unit tests mock every HTTP call, which means bugs in filter strings, URL paths,
request body shapes, and response parsing are invisible until the code runs
against production. The DLP `setting.type` filter bug that prompted this suite
is a perfect example: the unit tests passed for months while the API silently
returned zero results.

## What these tests actually do

Every test in this directory calls a real Google API endpoint using Application
Default Credentials (ADC). No mocks, no fakes, no stubs. Each test file targets
one API client module:

**`admin-sdk.e2e.ts`** tests `getCustomerId`, `listOrgUnits`, and
`listChromeActivities`. It verifies the customer ID matches the fixture, that
org units come back with the expected shape (`name`, `orgUnitId`,
`orgUnitPath`), and that Chrome activity listing doesn't error.

**`chrome-management.e2e.ts`** tests `countBrowserVersions` and
`listCustomerProfiles`. It verifies the URLs are constructed correctly and the
response arrays parse with the expected fields (`version`, `count` for browser
versions).

**`chrome-policy.e2e.ts`** tests `getConnectorPolicy` with both the wildcard
filter and every individual `ConnectorPolicyFilter` value. The key assertion:
none of the schema filter strings should produce a `400 Bad Request`. A 404 (not
configured) is fine. A 400 means the schema identifier is wrong and we have the
same class of bug as the DLP filter issue.

**`dlp-rules.e2e.ts`** is the test that would have caught the original bug. It
does two things in parallel: a direct GET of a known DLP rule (no filter, always
works), and a filtered list via `listDlpPolicies`. It then verifies the known
rule appears in both results and that the `setting.type` values match. It also
checks that every trigger string on the real rule exists in our
`CHROME_DLP_TRIGGERS` constants.

## How the "ground truth" pattern works

The DLP test is the most important one to understand because it demonstrates the
core pattern:

1. **Direct GET** fetches a specific policy by resource name
   (`policies/akajj264apgibowmbu`). This is a simple
   `GET /v1beta1/policies/{name}` call with no filter parameter. It always works
   if the policy exists.

2. **Filtered list** calls `listDlpPolicies("rule", ...)` which internally
   constructs a filter like `setting.type == "settings/rule.dlp"`. This is where
   the bug was: the filter said `"rule.dlp"` but the API stores
   `"settings/rule.dlp"`.

3. **Comparison**: the test verifies the known rule appears in the filtered
   list. If the filter is wrong, the list returns zero results and the test
   fails immediately with a clear message.

This same pattern (ground truth vs. filtered/constructed query) is used across
all test files. The Chrome Policy tests verify that schema filter strings don't
produce 400 errors. The Admin SDK tests verify response shapes against real
data.

## The fixtures file

All environment-specific values live in **`fixtures.ts`**. When you switch test
environments, this is the only file you change:

```typescript
export const TEST_DOMAIN = "cep-netnew.cc";
export const CUSTOMER_ID = "C01b1e65b";
export const KNOWN_DLP_RULE = "policies/akajj264apgibowmbu";
```

`fixtures.ts` also exports `normalizeOrgUnitId`, a helper that strips the `id:`
prefix from org unit IDs. The Admin SDK returns IDs like `"id:03ph8a2z1hiis1t"`
but the Chrome Policy API expects just `"03ph8a2z1hiis1t"`. In the MCP tool
layer, this normalization happens automatically in `guarded-tool-call.ts` via
`validateAndGetOrgUnitId`. But e2e tests call API functions directly (bypassing
the tool layer), so they need to do it themselves. The function lives in
fixtures so every test that touches org units uses the same logic.

## Prerequisites

### 1. Application Default Credentials

The tests authenticate using ADC. You need valid credentials for a Workspace
admin account on the test domain:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/cloud-platform,\
https://www.googleapis.com/auth/admin.directory.customer.readonly,\
https://www.googleapis.com/auth/admin.directory.orgunit.readonly,\
https://www.googleapis.com/auth/admin.reports.audit.readonly,\
https://www.googleapis.com/auth/chrome.management.policy,\
https://www.googleapis.com/auth/chrome.management.reports.readonly,\
https://www.googleapis.com/auth/chrome.management.profiles.readonly,\
https://www.googleapis.com/auth/cloud-identity.policies
```

If you get `PERMISSION_DENIED` or `401` errors, your ADC credentials are stale
or the account doesn't have admin privileges on the test domain.

### 2. A known DLP rule must exist

The DLP test requires at least one DLP rule in the test domain. To create one:

1. Go to
   [Admin Console > Security > Data protection > Manage rules](https://admin.google.com/ac/dp/rules)
2. Create a new rule with any name and condition
3. Enable at least one Chrome trigger (file upload, download, print, navigation,
   or web content upload)
4. Set the action to Audit or Warn (not Block)
5. Save the rule
6. Copy the policy name from the URL. The URL looks like
   `https://admin.google.com/ac/dp/rules/policies%2Fakajj264apgibowmbu`. The
   `%2F` is a URL-encoded `/`, so the policy name is
   `policies/akajj264apgibowmbu`.
7. Update `KNOWN_DLP_RULE` in `fixtures.ts`

If the rule is deleted, the DLP test will fail with a `404` on the direct GET.
Create a new one and update the fixture.

### 3. At least one org unit must exist

The Chrome Policy and Admin SDK tests need at least one organizational unit. The
root org unit always exists, so this should not be an issue unless the Workspace
domain is brand new.

### 4. Quota project

If you see `RESOURCE_EXHAUSTED` (429) errors, the Cloud Identity API has
per-project rate limits. Make sure your ADC credentials have a quota project
set:

```bash
gcloud auth application-default set-quota-project <your-project-id>
```

The Cloud Identity v1beta1 policies endpoint has tight rate limits. The tests
are designed to minimize API calls (e.g. the DLP test makes exactly 2 calls
total), but if you run them repeatedly in quick succession, you may hit limits.
Wait 30 seconds and retry.

## Running the tests

```bash
# From mcp-server/
npm run test:e2e
```

This runs `vitest run --config e2e/vitest.config.ts` with a 30-second timeout
per test. The e2e tests are excluded from the main `npm test` command (the unit
test vitest config has `exclude: ["e2e/**"]`), so they never interfere with CI
or coverage metrics.

## Switching to a different test environment

1. Open `e2e/fixtures.ts`
2. Update `TEST_DOMAIN` to the new Workspace domain
3. Update `CUSTOMER_ID` to the new customer ID (find it in Admin Console >
   Account > Account settings, or call `getCustomerId()` with ADC for that
   domain)
4. Create a DLP rule in the new domain (see "A known DLP rule must exist" above)
   and update `KNOWN_DLP_RULE`
5. Run `npm run test:e2e` to verify everything works

That is it. No other files need to change.

## What to set up for ideal coverage

The e2e tests validate that our code talks to the APIs correctly, but some tests
can only verify "the API didn't error" rather than "the API returned meaningful
data". Here is what you should configure in the test domain so every test
validates real data instead of empty arrays:

**Chrome browser enrollment** (for `chrome-management.e2e.ts`): Enroll at least
one Chrome browser under the test domain using Chrome Browser Cloud Management.
This ensures `countBrowserVersions` returns actual version data and
`listCustomerProfiles` returns at least one profile. Without enrolled browsers,
these tests pass but only verify the response is an empty array.

**Chrome activity** (for `admin-sdk.e2e.ts`): Generate some Chrome activity in
the test domain. Browse to a few URLs, trigger a file download, etc. This
ensures `listChromeActivities` returns real events. Without activity, the test
passes but only verifies the API returns an empty array.

**Enterprise Connectors** (for `chrome-policy.e2e.ts`): Configure at least one
Chrome Enterprise Connector (e.g. OnFileAttached) on any org unit. This ensures
the connector policy test validates a real resolved policy, not just "the API
returned an empty response". Without connectors configured, the test only
verifies the schema filter strings are syntactically valid.

**Multiple org units** (for `admin-sdk.e2e.ts`): Create at least one child org
unit under the root. This makes the `listOrgUnits` test more meaningful since it
verifies the full list is returned, not just a single root unit.

**DLP rule with all triggers** (for `dlp-rules.e2e.ts`): The known DLP rule
should have all 5 Chrome triggers enabled (FILE_UPLOAD, FILE_DOWNLOAD,
WEB_CONTENT_UPLOAD, PRINT, URL_NAVIGATION). This ensures the trigger constant
validation covers every value. If you only enable one trigger, only that one
gets validated against `CHROME_DLP_TRIGGERS`.

## Adding new e2e tests

When you add a new API client function or a new hardcoded filter/schema string:

1. Create a new `*.e2e.ts` file or add to an existing one
2. Import constants from `./fixtures` (never hardcode customer IDs or policy
   names in test files)
3. If the function uses any kind of filter string, use the ground-truth pattern:
   fetch the resource directly, then verify the filtered/constructed query also
   returns it
4. Keep API calls to a minimum per test to avoid rate limiting. Prefer
   `Promise.all` for independent calls
5. If you need new fixtures (e.g. a known connector policy name), add them to
   `fixtures.ts` with documentation on how to create them
