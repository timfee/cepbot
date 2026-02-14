/**
 * E2E: Admin SDK API client validation.
 *
 * Verifies that URL paths, query params, and response shapes for
 * getCustomerId, listOrgUnits, and listChromeActivities match what
 * the real Admin SDK returns.
 */

import {
  getCustomerId,
  listChromeActivities,
  listOrgUnits,
} from "@lib/api/admin-sdk";
import { describe, expect, it } from "vitest";

import { CUSTOMER_ID } from "./fixtures";

describe("Admin SDK", () => {
  it("getCustomerId returns a valid customer", async () => {
    const customer = await getCustomerId();
    expect(customer).not.toBeNull();
    expect(customer?.id).toBe(CUSTOMER_ID);
  });

  it("listOrgUnits returns org units with expected shape", async () => {
    const orgUnits = await listOrgUnits({ customerId: CUSTOMER_ID });
    expect(orgUnits.length).toBeGreaterThan(0);

    for (const ou of orgUnits) {
      expect(typeof ou.name).toBe("string");
      expect(typeof ou.orgUnitId).toBe("string");
      expect(typeof ou.orgUnitPath).toBe("string");
    }
  });

  it("listChromeActivities returns without error", async () => {
    const activities = await listChromeActivities({
      customerId: CUSTOMER_ID,
      maxResults: 1,
      userKey: "all",
    });

    expect(Array.isArray(activities)).toBe(true);
  });
});
