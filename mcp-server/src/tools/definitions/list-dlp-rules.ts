/**
 * Tool definition: lists DLP rules or detectors filtered to
 * Chrome-supported triggers.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { listDlpPolicies } from "@lib/api/cloud-identity";
import { CHROME_DLP_TRIGGERS } from "@lib/constants";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { commonSchemas, getAuthToken } from "@tools/schemas";
import { z } from "zod";

const SUPPORTED_TRIGGERS: Set<string> = new Set(
  Object.values(CHROME_DLP_TRIGGERS)
);

/**
 * Registers the list_dlp_rules tool with the MCP server.
 */
export function registerListDlpRulesTool(server: McpServer): void {
  server.registerTool(
    "list_dlp_rules",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        "Lists all DLP rules or detectors for a given customer. The tool returns rules with multiple attributes, parse them and return names, summarize the action.",
      inputSchema: {
        customerId: commonSchemas.customerId,
        type: z
          .enum(["rule", "detector"])
          .optional()
          .describe(
            'Filter by policy type. Defaults to "rule". Set to "detector" to list detectors.'
          ),
      },
      title: "List DLP Rules",
    },
    guardedToolCall({
      handler: async ({ customerId, type }, { requestInfo }) => {
        const authToken = getAuthToken(requestInfo);
        const policyType = type ?? "rule";

        const policies = await listDlpPolicies(
          policyType,
          authToken,
          customerId
        );

        const filteredPolicies = policies.filter((policy) => {
          const triggers = policy.setting?.value?.triggers;
          if (Array.isArray(triggers)) {
            return triggers.some((trigger) => SUPPORTED_TRIGGERS.has(trigger));
          }
          return false;
        });

        if (filteredPolicies.length === 0) {
          return {
            content: [
              {
                text: `No DLP ${String(policyType)}s found with supported triggers.`,
                type: "text" as const,
              },
            ],
          };
        }

        return {
          content: [
            {
              text: `DLP ${String(policyType)}:\n${JSON.stringify(filteredPolicies, null, 2)}`,
              type: "text" as const,
            },
          ],
        };
      },
    })
  );
}
