/**
 * Registers all MCP prompt definitions with the server.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { registerCepPrompt } from "./definitions/cep";
import { registerDiagnosePrompt } from "./definitions/diagnose";
import { registerMaturityPrompt } from "./definitions/maturity";
import { registerNoisePrompt } from "./definitions/noise";

/**
 * Registers every prompt with the MCP server instance.
 */
export function registerPrompts(server: McpServer): void {
  registerCepPrompt(server);
  registerDiagnosePrompt(server);
  registerMaturityPrompt(server);
  registerNoisePrompt(server);
}
