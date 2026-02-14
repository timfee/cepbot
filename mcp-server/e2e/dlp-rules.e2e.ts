/**
 * E2E tests for DLP rule listing against the real Cloud Identity API.
 *
 * Verifies that filter strings in listDlpPolicies actually match
 * policies returned by the API. This catches the class of bug where
 * unit tests pass (mocked) but the real API returns zero results
 * because the filter string doesn't match what the API stores.
 *
 * Approach: direct GET a known policy (no filter), then verify our
 * filtered list also returns it. Only 2 API calls total.
 *
 * Prerequisites:
 *   - Application Default Credentials configured
 *   - The known DLP rule exists in the target customer
 *
 * Run with:
 *   npx vitest run --config e2e/vitest.config.ts
 */

import type { DlpPolicy } from "@lib/api/cloud-identity";

import { listDlpPolicies } from "@lib/api/cloud-identity";
import { googleFetch } from "@lib/api/fetch";
import { API_BASE_URLS } from "@lib/constants";
import { describe, expect, it } from "vitest";

const CUSTOMER_ID = "C01b1e65b";

/** A known DLP rule that must exist in the test customer. */
const KNOWN_RULE = "policies/akajj264apgibowmbu";

describe("DLP rule listing (e2e)", () => {
  it("listDlpPolicies filter matches what the API actually stores", async () => {
    // Two calls: direct GET (ground truth) + filtered list (what our code does)
    const [directPolicy, filteredRules] = await Promise.all([
      googleFetch<DlpPolicy>(`${API_BASE_URLS.CLOUD_IDENTITY}/${KNOWN_RULE}`),
      listDlpPolicies("rule", null, CUSTOMER_ID),
    ]);

    // 1. The known rule must be fetchable
    expect(directPolicy.name).toBe(KNOWN_RULE);
    expect(directPolicy.setting?.type).toContain("rule.dlp");

    // 2. The filtered list must return results
    expect(filteredRules.length).toBeGreaterThan(0);

    // 3. The known rule must appear in the filtered list
    const found = filteredRules.find((r) => r.name === KNOWN_RULE);
    expect(found).toBeDefined();

    // 4. setting.type must match between direct GET and filtered list
    expect(found?.setting?.type).toBe(directPolicy.setting?.type);
  });
});
