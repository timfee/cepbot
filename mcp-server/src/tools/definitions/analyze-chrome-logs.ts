/**
 * Tool definition: retrieves Chrome activity logs scoped for
 * risky behavior analysis.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { listChromeActivities } from "@lib/api/admin-sdk";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { commonSchemas, getAuthToken } from "@tools/schemas";
import { z } from "zod";

/**
 * Registers the analyze_chrome_logs_for_risky_activity tool with the MCP server.
 */
export function registerAnalyzeChromeLogsTool(server: McpServer): void {
  server.registerTool(
    "analyze_chrome_logs_for_risky_activity",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description: "Analyzes Chrome activity logs for risky behavior.",
      inputSchema: {
        customerId: commonSchemas.customerId,
        endTime: z
          .string()
          .optional()
          .describe(
            "The end time of the range to get activities for (RFC3339 timestamp)."
          ),
        startTime: z
          .string()
          .optional()
          .describe(
            "The start time of the range to get activities for (RFC3339 timestamp)."
          ),
        userKey: z
          .string()
          .describe(
            'The user key to get activities for. Use "all" for all users.'
          )
          .default("all"),
      },
      title: "Analyze Chrome Logs",
    },
    guardedToolCall({
      handler: async (
        { customerId, endTime, startTime, userKey },
        { requestInfo }
      ) => {
        const authToken = getAuthToken(requestInfo);

        const activities = await listChromeActivities(
          {
            customerId,
            endTime,
            startTime,
            userKey: userKey ?? "all",
          },
          authToken
        );

        if (activities.length === 0) {
          return {
            content: [
              {
                text: "No Chrome activity found for the specified criteria.",
                type: "text" as const,
              },
            ],
          };
        }

        return {
          content: [
            {
              text: JSON.stringify(activities),
              type: "text" as const,
            },
          ],
        };
      },
    })
  );
}
