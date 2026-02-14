/**
 * Prompt definition: runs a full health check across all
 * organizational units.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { DIAGNOSE_INSTRUCTIONS, buildPromptResult } from "@prompts/content";

/**
 * Registers the cep:diagnose prompt with the MCP server.
 */
export function registerDiagnosePrompt(server: McpServer): void {
  server.registerPrompt(
    "cep:diagnose",
    {
      description:
        "Plan and execute a parallel health check of the Chrome Enterprise environment.",
      title: "Diagnose Environment",
    },
    () => buildPromptResult(DIAGNOSE_INSTRUCTIONS)
  );
}
