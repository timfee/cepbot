/**
 * Prompt definition: assesses DLP maturity by analyzing rule
 * configurations and telemetry.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { MATURITY_STEPS, buildPromptResult } from "@prompts/content";

/**
 * Registers the cep:maturity prompt with the MCP server.
 */
export function registerMaturityPrompt(server: McpServer): void {
  server.registerPrompt(
    "cep:maturity",
    {
      description: "Assess the DLP maturity of the user's environment.",
      title: "DLP Maturity Assessment",
    },
    () => buildPromptResult(MATURITY_STEPS)
  );
}
