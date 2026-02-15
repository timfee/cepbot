/**
 * Recovery tool — re-runs the bootstrap sequence after the user has
 * fixed credentials or network issues. Bypasses the degraded-mode
 * guard since its purpose is to exit degraded mode.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { resetCachedAuth, setFallbackQuotaProject } from "@lib/api/fetch";
import { createMcpLogger } from "@lib/apis";
import { bootstrap } from "@lib/bootstrap";
import {
  formatDegradedModeError,
  setServerDegraded,
  setServerHealthy,
} from "@lib/server-state";
import { customerIdCache } from "@tools/guarded-tool-call";

/**
 * Registers the retry_bootstrap tool with the MCP server.
 * This tool does NOT use guardedToolCall so it is always
 * available, even when the server is in degraded mode.
 */
export function registerRetryBootstrapTool(server: McpServer): void {
  server.registerTool(
    "retry_bootstrap",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Re-runs the server bootstrap sequence. Call this after the user has fixed credentials, installed gcloud, or resolved other setup issues. This tool is always available, even when the server is in degraded mode.",
      inputSchema: {},
      title: "Retry Bootstrap",
    },
    async () => {
      const progress = createMcpLogger(server, "retry-bootstrap");
      progress({
        data: "Clearing cached GoogleAuth instance...",
        level: "info",
      });
      resetCachedAuth();
      progress({ data: "Clearing cached customer ID...", level: "info" });
      customerIdCache.clear();
      progress({ data: "Re-running bootstrap sequence...", level: "info" });
      const result = await bootstrap(progress);

      if (result.ok) {
        setFallbackQuotaProject(result.projectId);
        setServerHealthy(result.projectId, result.region);
        if (result.customerId) {
          customerIdCache.set(result.customerId);
        }
        return {
          content: [
            {
              text: "Bootstrap succeeded. The server is now fully operational. All tools are available.",
              type: "text" as const,
            },
          ],
        };
      }

      setServerDegraded(result.error);
      return {
        content: [
          {
            text: `Bootstrap failed again.\n\n${formatDegradedModeError(result.error)}`,
            type: "text" as const,
          },
        ],
        isError: true,
      };
    }
  );
}
