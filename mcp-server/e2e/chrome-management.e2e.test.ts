import {
  countBrowserVersions,
  listCustomerProfiles,
} from "@lib/api/chrome-management";
import { describe, expect, it } from "vitest";

import { isExpectedApiError, resolveCustomerId } from "./helpers";

describe("Chrome Management E2E", () => {
  describe("countBrowserVersions", () => {
    it("returns an array of browser versions (may be empty)", async () => {
      const customerId = await resolveCustomerId();
      const versions = await countBrowserVersions(customerId);
      expect(Array.isArray(versions)).toBe(true);
      for (const v of versions) {
        expect(v).toHaveProperty("version");
        expect(v).toHaveProperty("count");
        expect(typeof v.count).toBe("number");
      }
    });
  });

  describe("listCustomerProfiles", () => {
    it("returns profiles or 403 if profiles scope not granted", async () => {
      const customerId = await resolveCustomerId();
      try {
        const profiles = await listCustomerProfiles(customerId);
        expect(Array.isArray(profiles)).toBe(true);
      } catch (error: unknown) {
        if (isExpectedApiError(error, 403)) {
          console.warn(
            "listCustomerProfiles returned 403 — re-run ADC login with chrome.management.profiles.readonly scope"
          );
          return;
        }
        throw error;
      }
    });
  });
});
