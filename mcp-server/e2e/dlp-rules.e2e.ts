/**
 * E2E: DLP rule listing filter validation.
 *
 * Verifies that DLP_SETTING_FILTERS in cloud-identity.ts actually
 * match what the Cloud Identity API stores. Uses direct GET as ground
 * truth, then checks that our filtered list also returns the policy.
 *
 * Run: npm run test:e2e
 */

import type { DlpPolicy } from "@lib/api/cloud-identity";

import { listDlpPolicies } from "@lib/api/cloud-identity";
import { googleFetch } from "@lib/api/fetch";
import { API_BASE_URLS, CHROME_DLP_TRIGGERS } from "@lib/constants";
import { describe, expect, it } from "vitest";

const CUSTOMER_ID = "C01b1e65b";
const KNOWN_RULE = "policies/akajj264apgibowmbu";

describe("DLP rule listing", () => {
  it("listDlpPolicies filter returns the known rule", async () => {
    const [directPolicy, filteredRules] = await Promise.all([
      googleFetch<DlpPolicy>(`${API_BASE_URLS.CLOUD_IDENTITY}/${KNOWN_RULE}`),
      listDlpPolicies("rule", null, CUSTOMER_ID),
    ]);

    // Direct GET works
    expect(directPolicy.name).toBe(KNOWN_RULE);
    expect(directPolicy.setting?.type).toContain("rule.dlp");

    // Filtered list also returns it
    expect(filteredRules.length).toBeGreaterThan(0);
    const found = filteredRules.find((r) => r.name === KNOWN_RULE);
    expect(found).toBeDefined();
    expect(found?.setting?.type).toBe(directPolicy.setting?.type);
  });

  it("CHROME_DLP_TRIGGERS match triggers on a real rule", async () => {
    const policy = await googleFetch<DlpPolicy>(
      `${API_BASE_URLS.CLOUD_IDENTITY}/${KNOWN_RULE}`
    );

    const apiTriggers = policy.setting?.value?.triggers as string[];
    expect(apiTriggers).toBeDefined();

    const knownTriggers = new Set(Object.values(CHROME_DLP_TRIGGERS));
    for (const trigger of apiTriggers) {
      expect(knownTriggers.has(trigger)).toBe(true);
    }
  });
});
