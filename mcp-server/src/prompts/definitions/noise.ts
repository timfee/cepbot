/**
 * Prompt definition: identifies noisy DLP rules with high
 * false-positive or override rates.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { NOISE_STEPS, buildPromptResult } from "@prompts/content";

/**
 * Registers the cep:noise prompt with the MCP server.
 */
export function registerNoisePrompt(server: McpServer): void {
  server.registerPrompt(
    "cep:noise",
    {
      description: "Analyze DLP rule noise and false positive rates.",
      title: "DLP Noise Analysis",
    },
    () => buildPromptResult(NOISE_STEPS)
  );
}
