/**
 * E2E: Chrome Management API client validation.
 *
 * Verifies that URL construction and response parsing for
 * countBrowserVersions and listCustomerProfiles work against
 * the real API.
 */

import {
  countBrowserVersions,
  listCustomerProfiles,
} from "@lib/api/chrome-management";
import { describe, expect, it } from "vitest";

import { CUSTOMER_ID } from "./fixtures";

describe("Chrome Management", () => {
  it("countBrowserVersions returns version data", async () => {
    const versions = await countBrowserVersions(CUSTOMER_ID);

    expect(Array.isArray(versions)).toBe(true);

    for (const v of versions) {
      expect(typeof v.version).toBe("string");
      expect(typeof v.count).toBe("number");
    }
  });

  it("listCustomerProfiles returns profile data", async () => {
    const profiles = await listCustomerProfiles(CUSTOMER_ID);

    expect(Array.isArray(profiles)).toBe(true);
  });
});
