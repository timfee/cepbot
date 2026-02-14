/**
 * E2E test fixtures — all environment-specific values live here.
 *
 * When switching to a different Workspace domain or test environment,
 * update ONLY this file. Every e2e test imports from here.
 *
 * See README.md for setup instructions.
 */

/** The Workspace test domain used for all e2e tests. */
export const TEST_DOMAIN = "cep-netnew.cc";

/** The Workspace customer ID for the test domain (Admin Console > Account > Account settings). */
export const CUSTOMER_ID = "C01b1e65b";

/**
 * A DLP rule resource name that is known to exist in the test domain.
 * Used as ground truth when validating that list filters return results.
 *
 * This must be a rule with:
 *   - setting.type containing "rule.dlp"
 *   - At least one Chrome DLP trigger from CHROME_DLP_TRIGGERS
 *
 * Create one in Admin Console > Security > Data protection > Manage rules,
 * then copy the policy name from the URL:
 *   https://admin.google.com/ac/dp/rules/policies%2F<ID>
 *   → "policies/<ID>"
 */
export const KNOWN_DLP_RULE = "policies/akajj264apgibowmbu";

/**
 * Strips the "id:" prefix from org unit IDs returned by the Admin SDK.
 *
 * The Admin SDK returns orgUnitId as "id:03ph8a2z1hiis1t" but the
 * Chrome Policy API expects just "03ph8a2z1hiis1t". The tool layer
 * handles this via validateAndGetOrgUnitId in schemas.ts, but e2e
 * tests call API functions directly and need to do it themselves.
 */
export function normalizeOrgUnitId(id: string): string {
  return id.startsWith("id:") ? id.slice(3) : id;
}
