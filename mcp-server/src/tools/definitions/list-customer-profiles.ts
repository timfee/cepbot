/**
 * Tool definition: lists browser profiles enrolled under a customer.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { listCustomerProfiles } from "@lib/api/chrome-management";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { commonSchemas } from "@tools/schemas";

/**
 * Registers the list_customer_profiles tool with the MCP server.
 */
export function registerListCustomerProfilesTool(server: McpServer): void {
  server.registerTool(
    "list_customer_profiles",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description: "Lists all customer browser profiles for a given customer.",
      inputSchema: {
        customerId: commonSchemas.customerId,
      },
      title: "List Customer Profiles",
    },
    guardedToolCall({
      handler: async ({ customerId }) => {
        const profiles = await listCustomerProfiles(customerId ?? "");

        if (profiles.length === 0) {
          return {
            content: [
              {
                text: `No profiles found for customer ${customerId}.`,
                type: "text" as const,
              },
            ],
          };
        }

        return {
          content: [
            {
              text: `Browser profiles for customer ${customerId}:\n${JSON.stringify(profiles)}`,
              type: "text" as const,
            },
          ],
        };
      },
    })
  );
}
