/**
 * Tool definition: creates a URL list resource for use in
 * Chrome policies.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { createUrlList } from "@lib/api/cloud-identity";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { commonSchemas, getAuthToken } from "@tools/schemas";
import { z } from "zod";

/**
 * Registers the create_url_list tool with the MCP server.
 */
export function registerCreateUrlListTool(server: McpServer): void {
  server.registerTool(
    "create_url_list",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description: "Creates a new URL list.",
      inputSchema: {
        customerId: commonSchemas.customerId,
        displayName: z.string().describe("The display name for the URL list."),
        orgUnitId: commonSchemas.orgUnitId.describe(
          "The ID of the organizational unit to filter results."
        ),
        urls: z
          .array(z.string())
          .describe("A list of URLs to include in the list."),
      },
      title: "Create URL List",
    },
    guardedToolCall({
      handler: async (
        { customerId, displayName, orgUnitId, urls },
        { requestInfo }
      ) => {
        const authToken = getAuthToken(requestInfo);
        const urlListConfig = {
          display_name: displayName,
          urls,
        };

        const createdPolicy = await createUrlList(
          customerId ?? "",
          orgUnitId,
          urlListConfig,
          authToken
        );

        return {
          content: [
            {
              text: `Successfully created URL list: ${createdPolicy.name}\n\nDetails:\n${JSON.stringify(createdPolicy, null, 2)}`,
              type: "text" as const,
            },
          ],
        };
      },
    })
  );
}
