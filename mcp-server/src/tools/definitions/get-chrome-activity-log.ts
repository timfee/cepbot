/**
 * Tool definition: retrieves Chrome browser activity logs with
 * sensible 10-day defaults so callers need no extra configuration.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { listChromeActivities } from "@lib/api/admin-sdk";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { commonSchemas, getAuthToken } from "@tools/schemas";
import { z } from "zod";

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

/**
 * Registers the get_chrome_activity_log tool with the MCP server.
 */
export function registerGetChromeActivityLogTool(server: McpServer): void {
  server.registerTool(
    "get_chrome_activity_log",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        "Gets a log of Chrome browser activity for a given user. By default, it retrieves events from the last 10 days unless a specific start time is provided. Do not prompt users for additional inputs; use the defaults if no values are provided.",
      inputSchema: {
        customerId: commonSchemas.customerId,
        endTime: z
          .string()
          .optional()
          .describe(
            "The end time of the range to get activities for (RFC3339 timestamp). Defaults to now."
          ),
        eventName: z
          .string()
          .optional()
          .describe("The name of the event to filter by."),
        maxResults: z
          .number()
          .optional()
          .describe("The maximum number of results to return."),
        startTime: z
          .string()
          .optional()
          .describe(
            "The start time of the range to get activities for (RFC3339 timestamp). Defaults to 10 days ago if not specified."
          ),
        userKey: z
          .string()
          .describe(
            'The user key to get activities for. Use "all" for all users.'
          )
          .default("all"),
      },
      title: "Get Chrome Activity Log",
    },
    guardedToolCall({
      handler: async (
        { customerId, endTime, eventName, maxResults, startTime, userKey },
        { requestInfo }
      ) => {
        const authToken = getAuthToken(requestInfo);

        const activities = await listChromeActivities(
          {
            customerId,
            endTime,
            eventName,
            maxResults,
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
              text: `Chrome activity:\n${JSON.stringify(activities, null, 2)}`,
              type: "text" as const,
            },
          ],
        };
      },
      transform: (params) => ({
        ...params,
        endTime: params.endTime ?? new Date().toISOString(),
        startTime:
          params.startTime ?? new Date(Date.now() - TEN_DAYS_MS).toISOString(),
      }),
    })
  );
}
