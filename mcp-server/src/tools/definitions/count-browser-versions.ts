/**
 * Tool definition: counts Chrome browser versions reported across
 * managed devices.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { countBrowserVersions } from "@lib/api/chrome-management";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { commonSchemas } from "@tools/schemas";

/**
 * Registers the count_browser_versions tool with the MCP server.
 */
export function registerCountBrowserVersionsTool(server: McpServer): void {
  server.registerTool(
    "count_browser_versions",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description: "Counts Chrome browser versions reported by devices.",
      inputSchema: {
        customerId: commonSchemas.customerId,
        orgUnitId: commonSchemas.orgUnitIdOptional,
      },
      title: "Count Browser Versions",
    },
    guardedToolCall({
      handler: async ({ customerId, orgUnitId }) => {
        const versions = await countBrowserVersions(
          customerId ?? "",
          orgUnitId
        );

        if (versions.length === 0) {
          return {
            content: [
              {
                text: `No browser versions found for customer ${customerId}.`,
                type: "text" as const,
              },
            ],
          };
        }

        const versionList = versions
          .map(
            (v) =>
              `- ${v.version} (${v.count} devices) - ${v.releaseChannel ?? "unknown"}`
          )
          .join("\n");

        return {
          content: [
            {
              text: `Browser versions for customer ${customerId}:\n${versionList}`,
              type: "text" as const,
            },
          ],
        };
      },
    })
  );
}
