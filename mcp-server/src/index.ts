/**
 * MCP server entry point — bootstraps the environment, registers
 * tools and prompts, then connects to stdio transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";

import { createProgressLogger } from "./lib/apis";
import { bootstrap } from "./lib/bootstrap";
import { errorMessage } from "./lib/constants";
import { setServerDegraded, setServerHealthy } from "./lib/server-state";
import { registerPrompts } from "./prompts/register";
import { registerRetryBootstrapTool } from "./tools/definitions/retry-bootstrap";
import { registerTools } from "./tools/register";

declare const __VERSION__: string;

const progress = createProgressLogger("server");

async function main(): Promise<void> {
  const result = await bootstrap(progress);

  if (result.ok) {
    setServerHealthy(result.projectId, result.region);
  } else {
    console.error(`[bootstrap] \u2717 ${result.error.problem}`);
    setServerDegraded(result.error);
  }

  const server = new McpServer(
    {
      name: "cepbot",
      version: __VERSION__,
    },
    {
      capabilities: { logging: {} },
    }
  );

  registerTools(server, result.ok ? { customerId: result.customerId } : {});
  registerRetryBootstrapTool(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  void server.sendLoggingMessage({
    data: result.ok
      ? "cepbot MCP server running on stdio"
      : "cepbot MCP server running in DEGRADED mode on stdio",
    level: result.ok ? "info" : "warning",
    logger: "server",
  });
}

try {
  await main();
} catch (error: unknown) {
  const message = errorMessage(error);
  console.error(`[fatal] \u2717 ${message}`);
  process.exit(1);
}
