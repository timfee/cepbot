/**
 * Prompt definition: top-level Chrome Enterprise Premium diagnostics
 * entry point with sub-command hints.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { HEALTH_CHECK_STEPS, buildPromptResult } from "@prompts/content";

const SUB_COMMAND_HINT = `

After the health check, let the user know they can also run:
- **/cep:maturity** — assess DLP maturity level
- **/cep:noise** — analyze DLP rule noise and false positive rates`;

/**
 * Registers the cep prompt with the MCP server.
 */
export function registerCepPrompt(server: McpServer): void {
  server.registerPrompt(
    "cep",
    {
      description:
        "Run Chrome Enterprise Premium diagnostics immediately on invocation.",
      title: "Chrome Enterprise Premium",
    },
    () => buildPromptResult(HEALTH_CHECK_STEPS + SUB_COMMAND_HINT)
  );
}
