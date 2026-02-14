/**
 * Tool definition: lists organizational units so other tools can
 * reference them by ID.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { listOrgUnits } from "@lib/api/admin-sdk";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { commonSchemas, getAuthToken } from "@tools/schemas";

/**
 * Registers the list_org_units tool with the MCP server.
 */
export function registerListOrgUnitsTool(server: McpServer): void {
  server.registerTool(
    "list_org_units",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        "Lists all organizational units for a given customer. This tool should be used whenever another tool requires an org unit ID. It provides users with a list of organizational unit names, so they do not need to manually search for the org unit ID.",
      inputSchema: {
        customerId: commonSchemas.customerId,
      },
      title: "List Org Units",
    },
    guardedToolCall({
      handler: async ({ customerId }, { requestInfo }) => {
        const authToken = getAuthToken(requestInfo);
        const orgUnits = await listOrgUnits({ customerId }, authToken);

        if (orgUnits.length === 0) {
          return {
            content: [
              {
                text: "No organizational units found for the specified criteria.",
                type: "text" as const,
              },
            ],
          };
        }

        return {
          content: [
            {
              text: `Organizational Units (${orgUnits.length}):\n${orgUnits
                .map(
                  (ou) => `- ${ou.name} [${ou.orgUnitId}] (${ou.orgUnitPath})`
                )
                .join("\n")}`,
              type: "text" as const,
            },
            {
              resource: {
                mimeType: "application/json",
                text: JSON.stringify(orgUnits, null, 2),
                uri: "https://admin.google.com/ac/orgunits",
              },
              type: "resource" as const,
            },
          ],
        };
      },
    })
  );
}
