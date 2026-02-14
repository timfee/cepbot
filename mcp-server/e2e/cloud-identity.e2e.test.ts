import { listOrgUnits } from "@lib/api/admin-sdk";
import { createDlpRule, listDlpPolicies } from "@lib/api/cloud-identity";
import { describe, expect, it } from "vitest";

import {
  isExpectedApiError,
  resolveCustomerId,
  stripIdPrefix,
} from "./helpers";

describe("Cloud Identity E2E", () => {
  describe("listDlpPolicies", () => {
    it("returns DLP rules array (may be empty)", async () => {
      const customerId = await resolveCustomerId();
      const policies = await listDlpPolicies("rule", null, customerId);
      expect(Array.isArray(policies)).toBe(true);
    });

    it("returns DLP detectors array (may be empty)", async () => {
      const customerId = await resolveCustomerId();
      const detectors = await listDlpPolicies("detector", null, customerId);
      expect(Array.isArray(detectors)).toBe(true);
    });
  });

  describe("createDlpRule (validateOnly)", () => {
    it("validates a DLP rule without creating it", async () => {
      const customerId = await resolveCustomerId();
      const units = await listOrgUnits({});
      if (units.length === 0) {
        console.warn("No org units found — skipping createDlpRule test");
        return;
      }

      const orgUnitId = stripIdPrefix(units[0].orgUnitId);

      try {
        const result = await createDlpRule(
          customerId,
          orgUnitId,
          { displayName: "e2e-validation-test", triggers: [] },
          true
        );
        expect(result).toBeDefined();
      } catch (error: unknown) {
        if (isExpectedApiError(error, 400)) {
          return;
        }
        throw error;
      }
    });
  });
});
