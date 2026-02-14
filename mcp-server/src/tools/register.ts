/**
 * Registers all MCP tool definitions with the server and seeds
 * the customer ID cache when available from bootstrap.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { registerAnalyzeChromeLogsTool } from "./definitions/analyze-chrome-logs";
import { registerCountBrowserVersionsTool } from "./definitions/count-browser-versions";
import { registerCreateDlpRuleTool } from "./definitions/create-dlp-rule";
import { registerCreateUrlListTool } from "./definitions/create-url-list";
import { registerDeleteDlpRuleTool } from "./definitions/delete-dlp-rule";
import { registerGetChromeActivityLogTool } from "./definitions/get-chrome-activity-log";
import { registerGetConnectorPolicyTool } from "./definitions/get-connector-policy";
import { registerGetCustomerIdTool } from "./definitions/get-customer-id";
import { registerListCustomerProfilesTool } from "./definitions/list-customer-profiles";
import { registerListDlpRulesTool } from "./definitions/list-dlp-rules";
import { registerListOrgUnitsTool } from "./definitions/list-org-units";
import { customerIdCache } from "./guarded-tool-call";

/**
 * Options passed from bootstrap to seed initial state into tools.
 */
export interface ToolRegistrationOptions {
  customerId?: string;
}

/**
 * Registers every tool with the MCP server instance.
 */
export function registerTools(
  server: McpServer,
  options?: ToolRegistrationOptions
): void {
  if (options?.customerId) {
    customerIdCache.set(options.customerId);
  }

  registerAnalyzeChromeLogsTool(server);
  registerCountBrowserVersionsTool(server);
  registerCreateDlpRuleTool(server);
  registerCreateUrlListTool(server);
  registerDeleteDlpRuleTool(server);
  registerGetChromeActivityLogTool(server);
  registerGetConnectorPolicyTool(server);
  registerGetCustomerIdTool(server);
  registerListCustomerProfilesTool(server);
  registerListDlpRulesTool(server);
  registerListOrgUnitsTool(server);
}
