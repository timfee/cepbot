/**
 * E2E: DLP rule listing filter validation.
 *
 * Verifies that DLP_SETTING_FILTERS in cloud-identity.ts actually
 * match what the Cloud Identity API stores. Uses direct GET as ground
 * truth, then checks that our filtered list also returns the policy.
 */

import type { DlpPolicy } from "@lib/api/cloud-identity";

import { listDlpPolicies } from "@lib/api/cloud-identity";
import { googleFetch } from "@lib/api/fetch";
import { API_BASE_URLS, CHROME_DLP_TRIGGERS } from "@lib/constants";
import { describe, expect, it } from "vitest";

import { CUSTOMER_ID, KNOWN_DLP_RULE } from "./fixtures";

describe("DLP rule listing", () => {
  it("filter returns the known rule and triggers match constants", async () => {
    // Two API calls: direct GET (ground truth) + filtered list
    const [directPolicy, filteredRules] = await Promise.all([
      googleFetch<DlpPolicy>(
        `${API_BASE_URLS.CLOUD_IDENTITY}/${KNOWN_DLP_RULE}`
      ),
      listDlpPolicies("rule", null, CUSTOMER_ID),
    ]);

    // Direct GET works
    expect(directPolicy.name).toBe(KNOWN_DLP_RULE);
    expect(directPolicy.setting?.type).toContain("rule.dlp");

    // Filtered list returns the known rule
    expect(filteredRules.length).toBeGreaterThan(0);
    const found = filteredRules.find((r) => r.name === KNOWN_DLP_RULE);
    expect(found).toBeDefined();
    expect(found?.setting?.type).toBe(directPolicy.setting?.type);

    // Triggers from the API match our CHROME_DLP_TRIGGERS constants
    const apiTriggers = directPolicy.setting?.value?.triggers!;
    expect(apiTriggers).toBeDefined();

    const knownTriggers = new Set(Object.values(CHROME_DLP_TRIGGERS));
    for (const trigger of apiTriggers) {
      expect(knownTriggers.has(trigger)).toBe(true);
    }
  });
});
