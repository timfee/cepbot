/**
 * Tool definition: permanently deletes a Chrome DLP rule by
 * policy name.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { deleteDlpRule } from "@lib/api/cloud-identity";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { getAuthToken } from "@tools/schemas";
import { z } from "zod";

/**
 * Registers the delete_dlp_rule tool with the MCP server.
 */
export function registerDeleteDlpRuleTool(server: McpServer): void {
  server.registerTool(
    "delete_dlp_rule",
    {
      annotations: {
        destructiveHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description: "Deletes a Chrome DLP rule.",
      inputSchema: {
        policyName: z
          .string()
          .describe(
            "The name of the policy to delete (e.g. policies/akajj264aovytg7aau)"
          ),
      },
      title: "Delete DLP Rule",
    },
    guardedToolCall({
      handler: async ({ policyName }, { requestInfo }) => {
        const authToken = getAuthToken(requestInfo);
        await deleteDlpRule(policyName, authToken);

        return {
          content: [
            {
              text: `Successfully deleted DLP rule: ${String(policyName)}`,
              type: "text" as const,
            },
          ],
        };
      },
      skipAutoResolve: true,
    })
  );
}
