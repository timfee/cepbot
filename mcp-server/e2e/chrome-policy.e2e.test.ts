import { listOrgUnits } from "@lib/api/admin-sdk";
import { CONNECTOR_WILDCARD, getConnectorPolicy } from "@lib/api/chrome-policy";
import { describe, expect, it } from "vitest";

import { resolveCustomerId, stripIdPrefix } from "./helpers";

describe("Chrome Policy E2E", () => {
  describe("getConnectorPolicy", () => {
    it("resolves connector policies via wildcard without error", async () => {
      const customerId = await resolveCustomerId();
      const units = await listOrgUnits({});
      if (units.length === 0) {
        console.warn("No org units found — skipping connector policy test");
        return;
      }

      const orgUnitId = stripIdPrefix(units[0].orgUnitId);

      // Wildcard resolution must NOT 404 — it returns {} when no
      // policies are configured, proving the namespace is valid.
      const result = await getConnectorPolicy(
        customerId,
        orgUnitId,
        CONNECTOR_WILDCARD
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });
});
