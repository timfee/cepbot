import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lib/api/admin-sdk", () => ({
  getCustomerId: vi.fn().mockResolvedValue({ id: "C-auto" }),
  listChromeActivities: vi.fn().mockResolvedValue([]),
  listOrgUnits: vi.fn().mockResolvedValue([]),
}));

vi.mock("@lib/api/chrome-management", () => ({
  countBrowserVersions: vi.fn().mockResolvedValue([]),
  listCustomerProfiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("@lib/api/cloud-identity", () => ({
  createDlpRule: vi.fn().mockResolvedValue({ name: "policies/new" }),
  createUrlList: vi.fn().mockResolvedValue({ name: "policies/url" }),
  deleteDlpRule: vi.fn().mockResolvedValue(undefined),
  listDlpPolicies: vi.fn().mockResolvedValue([]),
}));

vi.mock("@lib/api/chrome-policy", () => ({
  CONNECTOR_WILDCARD: "chrome.users.EnterpriseConnectors.*",
  ConnectorPolicyFilter: {
    ON_BULK_DATA_ENTRY: "chrome.users.EnterpriseConnectors.OnBulkDataEntry",
    ON_FILE_ATTACHED: "chrome.users.EnterpriseConnectors.OnFileAttached",
    ON_FILE_DOWNLOADED: "chrome.users.EnterpriseConnectors.OnFileDownloaded",
    ON_PRINT: "chrome.users.EnterpriseConnectors.OnPrint",
    ON_SECURITY_EVENT: "chrome.users.EnterpriseConnectors.OnSecurityEvent",
  },
  getConnectorPolicy: vi.fn().mockResolvedValue({ resolvedPolicies: [] }),
}));

const { getCustomerId, listChromeActivities, listOrgUnits } =
  await import("@lib/api/admin-sdk");
const { countBrowserVersions, listCustomerProfiles } =
  await import("@lib/api/chrome-management");
const { createDlpRule, createUrlList, deleteDlpRule, listDlpPolicies } =
  await import("@lib/api/cloud-identity");
const { getConnectorPolicy } = await import("@lib/api/chrome-policy");
const { customerIdCache } = await import("@tools/guarded-tool-call");

const { registerGetCustomerIdTool } =
  await import("@tools/definitions/get-customer-id");
const { registerListOrgUnitsTool } =
  await import("@tools/definitions/list-org-units");
const { registerListCustomerProfilesTool } =
  await import("@tools/definitions/list-customer-profiles");
const { registerCountBrowserVersionsTool } =
  await import("@tools/definitions/count-browser-versions");
const { registerListDlpRulesTool } =
  await import("@tools/definitions/list-dlp-rules");
const { registerCreateDlpRuleTool } =
  await import("@tools/definitions/create-dlp-rule");
const { registerDeleteDlpRuleTool } =
  await import("@tools/definitions/delete-dlp-rule");
const { registerCreateUrlListTool } =
  await import("@tools/definitions/create-url-list");
const { registerGetChromeActivityLogTool } =
  await import("@tools/definitions/get-chrome-activity-log");
const { registerAnalyzeChromeLogsTool } =
  await import("@tools/definitions/analyze-chrome-logs");
const { registerGetConnectorPolicyTool } =
  await import("@tools/definitions/get-connector-policy");

type ToolHandler = (
  params: Record<string, unknown>,
  context: {
    requestInfo?: { headers?: { authorization?: string } };
  }
) => Promise<{
  content: Record<string, unknown>[];
  isError?: boolean;
}>;

function assertMcpServer(_: object): asserts _ is McpServer {
  // test mock assertion
}

function captureHandler(registerFn: (server: McpServer) => void): ToolHandler {
  let handler: ToolHandler | undefined;
  const mockServer = {
    registerTool: (_name: string, _meta: unknown, h: ToolHandler) => {
      handler = h;
    },
  };
  assertMcpServer(mockServer);
  registerFn(mockServer);
  if (!handler) {
    throw new Error("handler not registered");
  }
  return handler;
}

const ctx = {
  requestInfo: { headers: { authorization: "Bearer test-tok" } },
};

describe("tool definitions", () => {
  beforeEach(() => {
    customerIdCache.set("");
    vi.mocked(getCustomerId).mockReset().mockResolvedValue({ id: "C-auto" });
    vi.mocked(listOrgUnits).mockReset().mockResolvedValue([]);
    vi.mocked(listChromeActivities).mockReset().mockResolvedValue([]);
    vi.mocked(countBrowserVersions).mockReset().mockResolvedValue([]);
    vi.mocked(listCustomerProfiles).mockReset().mockResolvedValue([]);
    vi.mocked(listDlpPolicies).mockReset().mockResolvedValue([]);
    vi.mocked(createDlpRule)
      .mockReset()
      .mockResolvedValue({ name: "policies/new" });
    vi.mocked(deleteDlpRule).mockReset().mockResolvedValue();
    vi.mocked(createUrlList)
      .mockReset()
      .mockResolvedValue({ name: "policies/url" });
    vi.mocked(getConnectorPolicy)
      .mockReset()
      .mockResolvedValue({ resolvedPolicies: [] });
  });

  describe("get_customer_id", () => {
    const handler = captureHandler(registerGetCustomerIdTool);

    it("returns customer ID", async () => {
      vi.mocked(getCustomerId).mockResolvedValue({ id: "C012345" });
      const result = await handler({}, ctx);
      expect(result.content[0].text).toContain("C012345");
    });

    it("returns error when customer not found", async () => {
      vi.mocked(getCustomerId).mockResolvedValue(null);
      const result = await handler({}, ctx);
      expect(result.content[0].text).toContain("Could not retrieve");
    });
  });

  describe("list_org_units", () => {
    const handler = captureHandler(registerListOrgUnitsTool);

    it("returns org units as names in text and full JSON as resource", async () => {
      vi.mocked(listOrgUnits).mockResolvedValue([
        { name: "Sales", orgUnitId: "1", orgUnitPath: "/Sales" },
      ]);
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("- Sales [1] (/Sales)");
      expect(result.content[0].text).toContain("Organizational Units (1)");
      expect(result.content[1]).toStrictEqual({
        annotations: { audience: ["assistant"], priority: 0.5 },
        resource: {
          mimeType: "application/json",
          text: expect.stringContaining('"name": "Sales"'),
          uri: "cep://org-units",
        },
        type: "resource",
      });
    });

    it("returns message when no org units", async () => {
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("No organizational units");
    });
  });

  describe("list_customer_profiles", () => {
    const handler = captureHandler(registerListCustomerProfilesTool);

    it("returns profiles", async () => {
      vi.mocked(listCustomerProfiles).mockResolvedValue([
        { browserVersion: "120.0" },
      ]);
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("120.0");
    });

    it("returns message when no profiles", async () => {
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("No profiles found");
    });

    it("falls back to empty string when customerId is undefined", async () => {
      vi.mocked(getCustomerId).mockResolvedValue(null);
      await handler({}, ctx);
      expect(listCustomerProfiles).toHaveBeenCalledWith("");
    });
  });

  describe("count_browser_versions", () => {
    const handler = captureHandler(registerCountBrowserVersionsTool);

    it("returns version list", async () => {
      vi.mocked(countBrowserVersions).mockResolvedValue([
        { count: 10, releaseChannel: "stable", version: "120.0" },
      ]);
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("120.0");
      expect(result.content[0].text).toContain("10 devices");
    });

    it("returns message when no versions", async () => {
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("No browser versions");
    });

    it("falls back to empty string when customerId is undefined", async () => {
      vi.mocked(getCustomerId).mockResolvedValue(null);
      vi.mocked(countBrowserVersions).mockResolvedValue([]);
      await handler({}, ctx);
      expect(countBrowserVersions).toHaveBeenCalledWith("", undefined);
    });

    it("handles missing releaseChannel", async () => {
      vi.mocked(countBrowserVersions).mockResolvedValue([
        { count: 5, version: "119.0" },
      ]);
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("unknown");
    });
  });

  describe("list_dlp_rules", () => {
    const handler = captureHandler(registerListDlpRulesTool);

    it("returns filtered policies", async () => {
      vi.mocked(listDlpPolicies).mockResolvedValue([
        {
          name: "policies/abc",
          setting: {
            value: {
              triggers: ["google.workspace.chrome.file.v1.upload"],
            },
          },
        },
      ]);
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("policies/abc");
    });

    it("filters out unsupported triggers", async () => {
      vi.mocked(listDlpPolicies).mockResolvedValue([
        {
          name: "policies/xyz",
          setting: { value: { triggers: ["unsupported.trigger"] } },
        },
      ]);
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("No DLP");
    });

    it("filters out policies without triggers", async () => {
      vi.mocked(listDlpPolicies).mockResolvedValue([
        { name: "policies/no-triggers", setting: { value: {} } },
      ]);
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("No DLP");
    });

    it("defaults to rule type", async () => {
      await handler({ customerId: "C012345" }, ctx);
      expect(listDlpPolicies).toHaveBeenCalledWith(
        "rule",
        "test-tok",
        "C012345"
      );
    });
  });

  describe("create_dlp_rule", () => {
    const handler = captureHandler(registerCreateDlpRuleTool);

    it("creates a DLP rule with WARN action", async () => {
      const result = await handler(
        {
          action: "WARN",
          condition: "all_content.contains('secret')",
          customerId: "C012345",
          displayName: "Test Rule",
          orgUnitId: "ou123",
          triggers: ["FILE_UPLOAD"],
        },
        ctx
      );
      expect(result.content[0].text).toContain("Successfully created");
      expect(createDlpRule).toHaveBeenCalledWith(
        "C012345",
        "ou123",
        expect.objectContaining({
          displayName: expect.stringContaining("\u{1F916}"),
        }),
        undefined,
        "test-tok"
      );
    });

    it("creates a DLP rule with AUDIT action", async () => {
      await handler(
        {
          action: "AUDIT",
          condition: "true",
          customerId: "C012345",
          displayName: "Audit Rule",
          orgUnitId: "ou123",
          triggers: ["FILE_DOWNLOAD"],
        },
        ctx
      );
      expect(createDlpRule).toHaveBeenCalledWith(
        "C012345",
        "ou123",
        expect.objectContaining({
          action: { chromeAction: { auditOnly: {} } },
        }),
        undefined,
        "test-tok"
      );
    });

    it("rejects BLOCK action", async () => {
      const result = await handler(
        {
          action: "BLOCK",
          condition: "true",
          customerId: "C012345",
          displayName: "Block Rule",
          orgUnitId: "ou123",
          triggers: ["FILE_UPLOAD"],
        },
        ctx
      );
      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain("not permitted");
    });

    it("handles validateOnly mode", async () => {
      const result = await handler(
        {
          action: "WARN",
          condition: "true",
          customerId: "C012345",
          displayName: "Validate Rule",
          orgUnitId: "ou123",
          triggers: ["FILE_UPLOAD"],
          validateOnly: true,
        },
        ctx
      );
      expect(result.content[0].text).toContain("validation successful");
    });

    it("includes action params for WARN", async () => {
      await handler(
        {
          action: "WARN",
          blockScreenshot: true,
          condition: "true",
          customMessage: "Be careful",
          customerId: "C012345",
          displayName: "Params Rule",
          orgUnitId: "ou123",
          saveContent: true,
          triggers: ["PRINT"],
          watermarkMessage: "Confidential",
        },
        ctx
      );
      expect(createDlpRule).toHaveBeenCalledWith(
        "C012345",
        "ou123",
        expect.objectContaining({
          action: {
            chromeAction: {
              warnUser: {
                actionParams: expect.objectContaining({
                  blockScreenshot: true,
                  customEndUserMessage: {
                    unsafeHtmlMessageBody: "Be careful",
                  },
                  saveContent: true,
                  watermarkMessage: "Confidential",
                }),
              },
            },
          },
        }),
        undefined,
        "test-tok"
      );
    });

    it("falls back to empty customerId when undefined", async () => {
      vi.mocked(getCustomerId).mockResolvedValue(null);
      await handler(
        {
          action: "AUDIT",
          condition: "true",
          displayName: "No CID",
          orgUnitId: "ou123",
          triggers: ["FILE_UPLOAD"],
        },
        ctx
      );
      expect(createDlpRule).toHaveBeenCalledWith(
        "",
        "ou123",
        expect.any(Object),
        undefined,
        "test-tok"
      );
    });

    it("creates WARN rule without action params", async () => {
      await handler(
        {
          action: "WARN",
          condition: "true",
          customerId: "C012345",
          displayName: "Simple Warn",
          orgUnitId: "ou123",
          triggers: ["FILE_UPLOAD"],
        },
        ctx
      );
      expect(createDlpRule).toHaveBeenCalledWith(
        "C012345",
        "ou123",
        expect.objectContaining({
          action: { chromeAction: { warnUser: {} } },
        }),
        undefined,
        "test-tok"
      );
    });
  });

  describe("delete_dlp_rule", () => {
    const handler = captureHandler(registerDeleteDlpRuleTool);

    it("deletes a DLP rule", async () => {
      const result = await handler({ policyName: "policies/abc" }, ctx);
      expect(result.content[0].text).toContain("Successfully deleted");
      expect(deleteDlpRule).toHaveBeenCalledWith("policies/abc", "test-tok");
    });
  });

  describe("create_url_list", () => {
    const handler = captureHandler(registerCreateUrlListTool);

    it("creates a URL list", async () => {
      const result = await handler(
        {
          customerId: "C012345",
          displayName: "Blocklist",
          orgUnitId: "ou123",
          urls: ["example.com"],
        },
        ctx
      );
      expect(result.content[0].text).toContain("Successfully created URL list");
    });

    it("falls back to empty string when customerId is undefined", async () => {
      vi.mocked(getCustomerId).mockResolvedValue(null);
      await handler(
        {
          displayName: "Blocklist",
          orgUnitId: "ou123",
          urls: ["example.com"],
        },
        ctx
      );
      expect(createUrlList).toHaveBeenCalledWith(
        "",
        "ou123",
        expect.any(Object),
        "test-tok"
      );
    });
  });

  describe("get_chrome_activity_log", () => {
    const handler = captureHandler(registerGetChromeActivityLogTool);

    it("returns activities", async () => {
      vi.mocked(listChromeActivities).mockResolvedValue([{ kind: "activity" }]);
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("Chrome activity");
    });

    it("returns message when no activities", async () => {
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("No Chrome activity");
    });

    it("defaults startTime and endTime via transform", async () => {
      await handler({ customerId: "C012345" }, ctx);
      const [callArgs] = vi.mocked(listChromeActivities).mock.calls[0];
      expect(callArgs.startTime).toBeDefined();
      expect(callArgs.endTime).toBeDefined();
    });

    it("preserves provided startTime and endTime", async () => {
      await handler(
        {
          customerId: "C012345",
          endTime: "2025-01-10T00:00:00Z",
          startTime: "2025-01-01T00:00:00Z",
        },
        ctx
      );
      const [callArgs] = vi.mocked(listChromeActivities).mock.calls[0];
      expect(callArgs.startTime).toBe("2025-01-01T00:00:00Z");
      expect(callArgs.endTime).toBe("2025-01-10T00:00:00Z");
    });
  });

  describe("analyze_chrome_logs_for_risky_activity", () => {
    const handler = captureHandler(registerAnalyzeChromeLogsTool);

    it("returns activities as JSON", async () => {
      vi.mocked(listChromeActivities).mockResolvedValue([{ kind: "risky" }]);
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("risky");
    });

    it("returns message when no activities", async () => {
      const result = await handler({ customerId: "C012345" }, ctx);
      expect(result.content[0].text).toContain("No Chrome activity");
    });
  });

  describe("get_connector_policy", () => {
    const handler = captureHandler(registerGetConnectorPolicyTool);

    it("returns configured status when data exists", async () => {
      vi.mocked(getConnectorPolicy).mockResolvedValue({
        resolvedPolicies: [{ value: "test" }],
      });
      const result = await handler(
        {
          customerId: "C012345",
          orgUnitId: "ou123",
          policy: "ON_FILE_ATTACHED",
        },
        ctx
      );
      expect(result.content[0].text).toContain("Configured (1)");
      expect(result.content[0].text).toContain("ou123: policies active");
    });

    it("returns not-configured status when resolvedPolicies is empty", async () => {
      vi.mocked(getConnectorPolicy).mockResolvedValue({});
      const result = await handler(
        {
          customerId: "C012345",
          orgUnitId: "ou123",
          policy: "ON_FILE_ATTACHED",
        },
        ctx
      );
      expect(result.content[0].text).toContain("Not configured (1)");
      expect(result.content[0].text).toContain("ou123: no policies");
    });

    it("handles 404 gracefully as not configured", async () => {
      const { GoogleApiError } = await import("@lib/api/fetch");
      vi.mocked(getConnectorPolicy).mockRejectedValue(
        new GoogleApiError(404, '{"error":{"code":404}}')
      );
      const result = await handler(
        {
          customerId: "C012345",
          orgUnitId: "ou123",
          policy: "ON_FILE_ATTACHED",
        },
        ctx
      );
      expect(result.content[0].text).toContain("Not configured (1)");
      expect(result.isError).toBeUndefined();
    });

    it("reports non-404 errors per org unit", async () => {
      const { GoogleApiError } = await import("@lib/api/fetch");
      vi.mocked(getConnectorPolicy).mockRejectedValue(
        new GoogleApiError(403, "permission denied")
      );
      const result = await handler(
        {
          customerId: "C012345",
          orgUnitId: "ou123",
          policy: "ON_FILE_ATTACHED",
        },
        ctx
      );
      expect(result.content[0].text).toContain("Errors (1)");
      expect(result.content[0].text).toContain("permission denied");
    });

    it("handles non-Error throws in error reporting", async () => {
      vi.mocked(getConnectorPolicy).mockRejectedValue("string error");
      const result = await handler(
        {
          customerId: "C012345",
          orgUnitId: "ou123",
          policy: "ALL",
        },
        ctx
      );
      expect(result.content[0].text).toContain("Errors (1)");
      expect(result.content[0].text).toContain("string error");
    });

    it("uses wildcard filter when policy is ALL", async () => {
      vi.mocked(getConnectorPolicy).mockResolvedValue({});
      await handler(
        {
          customerId: "C012345",
          orgUnitId: "ou123",
          policy: "ALL",
        },
        ctx
      );
      expect(getConnectorPolicy).toHaveBeenCalledWith(
        "C012345",
        "ou123",
        "chrome.users.EnterpriseConnectors.*",
        null,
        "test-tok"
      );
    });

    it("falls back to empty string when customerId is undefined", async () => {
      vi.mocked(getCustomerId).mockResolvedValue(null);
      await handler(
        {
          orgUnitId: "ou123",
          policy: "ON_FILE_ATTACHED",
        },
        ctx
      );
      expect(getConnectorPolicy).toHaveBeenCalledWith(
        "",
        "ou123",
        "chrome.users.EnterpriseConnectors.OnFileAttached",
        null,
        "test-tok"
      );
    });

    it("batches multiple orgUnitIds in parallel", async () => {
      vi.mocked(getConnectorPolicy)
        .mockResolvedValueOnce({
          resolvedPolicies: [{ value: "test" }],
        })
        .mockResolvedValueOnce({});
      const result = await handler(
        {
          customerId: "C012345",
          orgUnitIds: ["ou1", "ou2"],
          policy: "ALL",
        },
        ctx
      );
      expect(getConnectorPolicy).toHaveBeenCalledTimes(2);
      expect(result.content[0].text).toContain("2 org units");
      expect(result.content[0].text).toContain("Configured (1)");
      expect(result.content[0].text).toContain("Not configured (1)");
    });

    it("handles mixed success and failure in batch", async () => {
      const { GoogleApiError } = await import("@lib/api/fetch");
      vi.mocked(getConnectorPolicy)
        .mockResolvedValueOnce({
          resolvedPolicies: [{ value: "ok" }],
        })
        .mockRejectedValueOnce(new GoogleApiError(404, "not found"))
        .mockRejectedValueOnce(new GoogleApiError(403, "denied"));
      const result = await handler(
        {
          customerId: "C012345",
          orgUnitIds: ["ou1", "ou2", "ou3"],
          policy: "ALL",
        },
        ctx
      );
      expect(result.content[0].text).toContain("Configured (1)");
      expect(result.content[0].text).toContain("Not configured (1)");
      expect(result.content[0].text).toContain("Errors (1)");
    });

    it("returns validation error when no orgUnitId or orgUnitIds", async () => {
      const result = await handler(
        { customerId: "C012345", policy: "ALL" },
        ctx
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        "provide either orgUnitId or orgUnitIds"
      );
    });

    it("returns embedded resource with full results JSON", async () => {
      vi.mocked(getConnectorPolicy).mockResolvedValue({});
      const result = await handler(
        {
          customerId: "C012345",
          orgUnitId: "ou123",
          policy: "ALL",
        },
        ctx
      );
      expect(result.content[1]).toStrictEqual({
        annotations: { audience: ["assistant"], priority: 0.5 },
        resource: {
          mimeType: "application/json",
          text: expect.stringContaining('"orgUnitId": "ou123"'),
          uri: "cep://connector-policies",
        },
        type: "resource",
      });
    });
  });
});
