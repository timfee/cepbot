import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { describe, expect, it, vi } from "vitest";

vi.mock("@lib/api/admin-sdk", () => ({
  getCustomerId: vi.fn(),
  listChromeActivities: vi.fn(),
  listOrgUnits: vi.fn(),
}));

vi.mock("@lib/api/chrome-management", () => ({
  countBrowserVersions: vi.fn(),
  listCustomerProfiles: vi.fn(),
}));

vi.mock("@lib/api/cloud-identity", () => ({
  createDlpRule: vi.fn(),
  createUrlList: vi.fn(),
  deleteDlpRule: vi.fn(),
  listDlpPolicies: vi.fn(),
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
  getConnectorPolicy: vi.fn(),
}));

const { customerIdCache } = await import("@tools/guarded-tool-call");
const { registerTools } = await import("@tools/register");

function assertMcpServer(_: object): asserts _ is McpServer {
  // test mock assertion
}

function createMockServer() {
  const tools = new Map<string, unknown>();
  return {
    registerTool: vi.fn((name: string, _meta: unknown, _handler: unknown) => {
      tools.set(name, _handler);
    }),
    tools,
  };
}

describe("registerTools", () => {
  it("registers all 11 tools", () => {
    const server = createMockServer();
    assertMcpServer(server);
    registerTools(server);

    expect(server.registerTool).toHaveBeenCalledTimes(11);

    const expectedTools = [
      "analyze_chrome_logs_for_risky_activity",
      "count_browser_versions",
      "create_dlp_rule",
      "create_url_list",
      "delete_dlp_rule",
      "get_chrome_activity_log",
      "get_connector_policy",
      "get_customer_id",
      "list_customer_profiles",
      "list_dlp_rules",
      "list_org_units",
    ];

    for (const toolName of expectedTools) {
      expect(server.tools.has(toolName)).toBeTruthy();
    }
  });

  it("sets customerIdCache when customerId option is provided", () => {
    const server = createMockServer();
    customerIdCache.set("");

    assertMcpServer(server);
    registerTools(server, { customerId: "C012345" });

    expect(customerIdCache.get()).toBe("C012345");
  });

  it("does not set cache when no customerId option", () => {
    const server = createMockServer();
    customerIdCache.set("");

    assertMcpServer(server);
    registerTools(server);

    expect(customerIdCache.get()).toBe("");
  });
});
