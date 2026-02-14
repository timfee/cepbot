import {
  getCustomerId,
  listChromeActivities,
  listOrgUnits,
} from "@lib/api/admin-sdk";
import { describe, expect, it } from "vitest";

import { resolveCustomerId } from "./helpers";

describe("Admin SDK E2E", () => {
  describe("getCustomerId", () => {
    it("returns a customer object with a valid id", async () => {
      const customer = await getCustomerId();
      expect(customer).not.toBeNull();
      expect(customer?.id).toMatch(/^C[0-9a-z]+$/);
    });
  });

  describe("listOrgUnits", () => {
    it("returns an array of org units with expected shape", async () => {
      const units = await listOrgUnits({});
      expect(Array.isArray(units)).toBe(true);
      for (const unit of units) {
        expect(unit).toHaveProperty("name");
        expect(unit).toHaveProperty("orgUnitId");
        expect(unit).toHaveProperty("orgUnitPath");
        expect(typeof unit.orgUnitId).toBe("string");
      }
    });

    it("accepts an explicit customerId", async () => {
      const customerId = await resolveCustomerId();
      const units = await listOrgUnits({ customerId });
      expect(Array.isArray(units)).toBe(true);
    });
  });

  describe("listChromeActivities", () => {
    it("returns an array for all users", async () => {
      const activities = await listChromeActivities({ userKey: "all" });
      expect(Array.isArray(activities)).toBe(true);
    });

    it("accepts customerId and maxResults params", async () => {
      const customerId = await resolveCustomerId();
      const activities = await listChromeActivities({
        customerId,
        maxResults: 5,
        userKey: "all",
      });
      expect(Array.isArray(activities)).toBe(true);
    });
  });
});
