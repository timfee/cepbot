/**
 * E2E: Chrome Management API client validation.
 *
 * Verifies that URL construction and response parsing for
 * countBrowserVersions and listCustomerProfiles work against
 * the real API.
 *
 * Run: npm run test:e2e
 */

import {
  countBrowserVersions,
  listCustomerProfiles,
} from "@lib/api/chrome-management";
import { describe, expect, it } from "vitest";

const CUSTOMER_ID = "C01b1e65b";

describe("Chrome Management", () => {
  it("countBrowserVersions returns version data", async () => {
    const versions = await countBrowserVersions(CUSTOMER_ID);

    // Must be an array (may be empty if no managed browsers)
    expect(Array.isArray(versions)).toBe(true);

    for (const v of versions) {
      expect(typeof v.version).toBe("string");
      expect(typeof v.count).toBe("number");
    }
  });

  it("listCustomerProfiles returns profile data", async () => {
    const profiles = await listCustomerProfiles(CUSTOMER_ID);

    // Must be an array
    expect(Array.isArray(profiles)).toBe(true);
  });
});
