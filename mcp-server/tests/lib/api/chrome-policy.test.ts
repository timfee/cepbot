import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lib/api/fetch", () => ({
  googleFetch: vi.fn(),
}));

const { googleFetch } = await import("@lib/api/fetch");
const {
  CONNECTOR_VALUE_KEYS,
  CONNECTOR_WILDCARD,
  ConnectorPolicyFilter,
  getConnectorPolicy,
} = await import("@lib/api/chrome-policy");

describe("chrome-policy", () => {
  beforeEach(() => {
    vi.mocked(googleFetch).mockReset();
  });

  describe("ConnectorPolicyFilter", () => {
    it("maps all 5 policy types under EnterpriseConnectors namespace", () => {
      expect(Object.keys(ConnectorPolicyFilter)).toHaveLength(5);
      for (const schema of Object.values(ConnectorPolicyFilter)) {
        expect(schema).toContain("chrome.users.EnterpriseConnectors.");
      }
    });

    it("includes all expected connector event types", () => {
      expect(ConnectorPolicyFilter.ON_FILE_ATTACHED).toBe(
        "chrome.users.EnterpriseConnectors.OnFileAttached"
      );
      expect(ConnectorPolicyFilter.ON_FILE_DOWNLOADED).toBe(
        "chrome.users.EnterpriseConnectors.OnFileDownloaded"
      );
      expect(ConnectorPolicyFilter.ON_BULK_DATA_ENTRY).toBe(
        "chrome.users.EnterpriseConnectors.OnBulkDataEntry"
      );
      expect(ConnectorPolicyFilter.ON_PRINT).toBe(
        "chrome.users.EnterpriseConnectors.OnPrint"
      );
      expect(ConnectorPolicyFilter.ON_SECURITY_EVENT).toBe(
        "chrome.users.EnterpriseConnectors.OnSecurityEvent"
      );
    });
  });

  describe("CONNECTOR_VALUE_KEYS", () => {
    it("maps every schema to a camelCase value key", () => {
      expect(Object.keys(CONNECTOR_VALUE_KEYS)).toHaveLength(5);
      for (const [schema, valueKey] of Object.entries(CONNECTOR_VALUE_KEYS)) {
        expect(schema).toContain("chrome.users.EnterpriseConnectors.");
        expect(valueKey).toMatch(/^on[A-Z]/);
      }
    });
  });

  describe("CONNECTOR_WILDCARD", () => {
    it("uses the EnterpriseConnectors namespace wildcard", () => {
      expect(CONNECTOR_WILDCARD).toBe("chrome.users.EnterpriseConnectors.*");
    });
  });

  describe("getConnectorPolicy", () => {
    it("resolves connector policies", async () => {
      const policy = { resolvedPolicies: [{ value: "test" }] };
      vi.mocked(googleFetch).mockResolvedValue(policy);

      const result = await getConnectorPolicy(
        "C012345",
        "ou123",
        "chrome.users.EnterpriseConnectors.OnFileAttached",
        null,
        "tok"
      );

      expect(result).toStrictEqual(policy);
      expect(googleFetch).toHaveBeenCalledWith(
        "https://chromepolicy.googleapis.com/v1/customers/C012345/policies:resolve",
        {
          accessToken: "tok",
          body: {
            policySchemaFilter:
              "chrome.users.EnterpriseConnectors.OnFileAttached",
            policyTargetKey: {
              targetResource: "orgunits/ou123",
            },
          },
        }
      );
    });
  });
});
