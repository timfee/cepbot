/**
 * E2E: Chrome Policy API client validation.
 *
 * Verifies that getConnectorPolicy URL construction, request body
 * format, and response parsing work against the real API. Also
 * validates that ConnectorPolicyFilter schema identifiers are
 * recognized by the API (not 400).
 */

import { listOrgUnits } from "@lib/api/admin-sdk";
import {
  CONNECTOR_WILDCARD,
  ConnectorPolicyFilter,
  getConnectorPolicy,
} from "@lib/api/chrome-policy";
import { GoogleApiError } from "@lib/api/fetch";
import { describe, expect, it } from "vitest";

import { CUSTOMER_ID, normalizeOrgUnitId } from "./fixtures";

/**
 * Calls getConnectorPolicy and returns the HTTP status.
 * 200 = configured, 404 = not configured, 400 = bad schema filter.
 */
async function resolveStatus(
  orgUnitId: string,
  schemaFilter: string
): Promise<number> {
  try {
    await getConnectorPolicy(CUSTOMER_ID, orgUnitId, schemaFilter, null);
    return 200;
  } catch (error: unknown) {
    if (error instanceof GoogleApiError) {
      return error.status;
    }
    throw error;
  }
}

describe("Chrome Policy", () => {
  it("getConnectorPolicy with wildcard does not error", async () => {
    const orgUnits = await listOrgUnits({ customerId: CUSTOMER_ID });
    expect(orgUnits.length).toBeGreaterThan(0);

    const orgUnitId = normalizeOrgUnitId(orgUnits[0].orgUnitId);
    const result = await getConnectorPolicy(
      CUSTOMER_ID,
      orgUnitId,
      CONNECTOR_WILDCARD,
      null
    );

    expect(result).toBeDefined();
  });

  it("each ConnectorPolicyFilter value is accepted by the API", async () => {
    const orgUnits = await listOrgUnits({ customerId: CUSTOMER_ID });
    expect(orgUnits.length).toBeGreaterThan(0);
    const orgUnitId = normalizeOrgUnitId(orgUnits[0].orgUnitId);

    // Each filter should resolve without a 400 Bad Request.
    // 200 = configured, 404 = not configured (both fine).
    // 400 = bad schema filter string — same class of bug as DLP filters.
    const results: Record<string, number> = {};
    for (const [name, schemaFilter] of Object.entries(ConnectorPolicyFilter)) {
      results[name] = await resolveStatus(orgUnitId, schemaFilter);
    }

    for (const [_name, status] of Object.entries(results)) {
      expect(status).not.toBe(400);
    }
  });
});
