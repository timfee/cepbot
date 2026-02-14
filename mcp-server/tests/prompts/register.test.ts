import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { describe, expect, it, vi } from "vitest";

const { registerPrompts } = await import("@prompts/register");

function assertMcpServer(_: object): asserts _ is McpServer {
  // test mock assertion
}

function createMockServer() {
  const prompts = new Map<string, unknown>();
  return {
    prompts,
    registerPrompt: vi.fn(
      (name: string, _config: unknown, _handler: unknown) => {
        prompts.set(name, _handler);
      }
    ),
  };
}

describe("registerPrompts", () => {
  it("registers all 4 prompts", () => {
    const server = createMockServer();
    assertMcpServer(server);
    registerPrompts(server);

    expect(server.registerPrompt).toHaveBeenCalledTimes(4);

    const expectedPrompts = [
      "cep",
      "cep:diagnose",
      "cep:maturity",
      "cep:noise",
    ];

    for (const promptName of expectedPrompts) {
      expect(server.prompts.has(promptName)).toBeTruthy();
    }
  });
});
