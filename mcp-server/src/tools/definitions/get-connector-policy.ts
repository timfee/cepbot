/**
 * Tool definition: checks whether Chrome Enterprise connectors are
 * properly configured for one or more organizational units.
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

interface OrgUnitResult {
  data?: unknown;
  error?: string;
  orgUnitId: string;
  status: "configured" | "error" | "not_configured";
}

async function fetchPolicyForOrgUnit(
  customerId: string,
  orgUnitId: string,
  policySchemaFilter: string,
  authToken: string | null
): Promise<OrgUnitResult> {
  try {
    const policies = await getConnectorPolicy(
      customerId,
      orgUnitId,
      policySchemaFilter,
      null,
      authToken
    );

    const hasData =
      policies.resolvedPolicies && policies.resolvedPolicies.length > 0;

    return hasData
      ? { data: policies, orgUnitId, status: "configured" }
      : { orgUnitId, status: "not_configured" };
  } catch (error: unknown) {
    if (error instanceof GoogleApiError && error.status === 404) {
      return { orgUnitId, status: "not_configured" };
    }
    return {
      error: error instanceof Error ? error.message : String(error),
      orgUnitId,
      status: "error",
    };
  }
}

function formatResults(results: OrgUnitResult[], filter: string) {
  const configured = results.filter((r) => r.status === "configured");
  const notConfigured = results.filter((r) => r.status === "not_configured");
  const errors = results.filter((r) => r.status === "error");

  const lines: string[] = [
    `Connector policy results (${results.length} org units, filter: ${filter}):`,
  ];

  if (configured.length > 0) {
    lines.push(`\nConfigured (${configured.length}):`);
    for (const r of configured) {
      lines.push(`- ${r.orgUnitId}: policies active`);
    }
  }

  if (notConfigured.length > 0) {
    lines.push(`\nNot configured (${notConfigured.length}):`);
    for (const r of notConfigured) {
      lines.push(`- ${r.orgUnitId}: no policies`);
    }
  }

  if (errors.length > 0) {
    lines.push(`\nErrors (${errors.length}):`);
    for (const r of errors) {
      lines.push(`- ${r.orgUnitId}: ${r.error}`);
    }
  }

  return lines.join("\n");
}

/**
 * Registers the get_connector_policy tool with the MCP server.
 */
export function registerGetConnectorPolicyTool(server: McpServer): void {
  server.registerTool(
    "get_connector_policy",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        "Retrieves the configuration status for Chrome Enterprise connectors. Accepts a single orgUnitId or multiple orgUnitIds for batch checking (all queried in parallel). Pass 'ALL' as the policy to fetch every connector type in one call.",
      inputSchema: {
        customerId: commonSchemas.customerId,
        orgUnitId: commonSchemas.orgUnitId
          .optional()
          .describe("A single org unit ID. Use orgUnitIds for batch queries."),
        orgUnitIds: z
          .array(z.string())
          .optional()
          .describe(
            "Multiple org unit IDs to check in parallel. Preferred for health checks."
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
      handler: async (
        { customerId, orgUnitId, orgUnitIds, policy },
        { requestInfo }
      ) => {
        const authToken = getAuthToken(requestInfo);
        const policySchemaFilter =
          policy === "ALL" ? CONNECTOR_WILDCARD : ConnectorPolicyFilter[policy];

        const ids: string[] = orgUnitIds ?? (orgUnitId ? [orgUnitId] : []);

        if (ids.length === 0) {
          return {
            content: [
              {
                text: "Error: provide either orgUnitId or orgUnitIds.",
                type: "text" as const,
              },
            ],
            isError: true,
          };
        }

        const resolved = await Promise.all(
          ids.map((id) =>
            fetchPolicyForOrgUnit(
              customerId ?? "",
              id,
              policySchemaFilter,
              authToken
            )
          )
        );

        const text = formatResults(resolved, policySchemaFilter);

        return {
          content: [
            { text, type: "text" as const },
            {
              annotations: { audience: ["assistant" as const], priority: 0.5 },
              resource: {
                mimeType: "application/json",
                text: JSON.stringify(resolved, null, 2),
                uri: "cep://connector-policies",
              },
              type: "resource" as const,
            },
          ],
        };
      },
    })
  );
}
