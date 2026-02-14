/**
 * Tool definition: retrieves the customer ID for the authenticated
 * user via the Admin SDK.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { getCustomerId } from "@lib/api/admin-sdk";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { getAuthToken } from "@tools/schemas";

/**
 * Registers the get_customer_id tool with the MCP server.
 */
export function registerGetCustomerIdTool(server: McpServer): void {
  server.registerTool(
    "get_customer_id",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        "Gets the customer ID for the authenticated user. All other tools that require a customer ID should get it using this tool instead of asking the user for it.",
      inputSchema: {},
      title: "Get Customer ID",
    },
    guardedToolCall({
      handler: async (_params, { requestInfo }) => {
        const authToken = getAuthToken(requestInfo);
        const customer = await getCustomerId(authToken);

        if (!customer) {
          return {
            content: [
              {
                text: "Could not retrieve customer ID.",
                type: "text" as const,
              },
            ],
          };
        }

        return {
          content: [
            { text: `Customer ID: ${customer.id}`, type: "text" as const },
          ],
        };
      },
      skipAutoResolve: true,
    })
  );
}
