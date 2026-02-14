/**
 * Tool definition: checks whether Chrome Enterprise connectors are
 * properly configured for a given organizational unit.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import {
  CONNECTOR_WILDCARD,
  ConnectorPolicyFilter,
  getConnectorPolicy,
} from "@lib/api/chrome-policy";
import { GoogleApiError } from "@lib/api/fetch";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { commonSchemas, getAuthToken } from "@tools/schemas";
import { z } from "zod";

/**
 * Registers the get_connector_policy tool with the MCP server.
 */
export function registerGetConnectorPolicyTool(server: McpServer): void {
  server.registerTool(
    "get_connector_policy",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        "Retrieves the configuration status for Chrome Enterprise connectors. Pass a specific policy name to check one connector, or 'ALL' to fetch all connector policies in a single call. Returns the resolved policy configuration or indicates when no policy is configured.",
      inputSchema: {
        customerId: commonSchemas.customerId,
        orgUnitId: commonSchemas.orgUnitId.describe(
          "The ID of the organizational unit to filter results."
        ),
        policy: z
          .enum([
            "ALL",
            "ON_FILE_ATTACHED",
            "ON_FILE_DOWNLOADED",
            "ON_BULK_DATA_ENTRY",
            "ON_PRINT",
            "ON_SECURITY_EVENT",
          ])
          .describe(
            "The connector policy to check. Use 'ALL' to fetch every connector policy in one call (recommended for health checks)."
          ),
      },
      title: "Get Connector Policy",
    },
    guardedToolCall({
      handler: async ({ customerId, orgUnitId, policy }, { requestInfo }) => {
        const authToken = getAuthToken(requestInfo);
        const policySchemaFilter =
          policy === "ALL" ? CONNECTOR_WILDCARD : ConnectorPolicyFilter[policy];

        try {
          const policies = await getConnectorPolicy(
            customerId ?? "",
            orgUnitId,
            policySchemaFilter,
            null,
            authToken
          );

          const hasData =
            policies.resolvedPolicies && policies.resolvedPolicies.length > 0;

          return {
            content: [
              {
                text: hasData
                  ? `Connector policy:\n${JSON.stringify(policies, null, 2)}`
                  : `No connector policies configured for this organizational unit (filter: ${policySchemaFilter}).`,
                type: "text" as const,
              },
            ],
          };
        } catch (error: unknown) {
          if (error instanceof GoogleApiError && error.status === 404) {
            return {
              content: [
                {
                  text: `No connector policies configured for this organizational unit (filter: ${policySchemaFilter}).`,
                  type: "text" as const,
                },
              ],
            };
          }
          throw error;
        }
      },
    })
  );
}
