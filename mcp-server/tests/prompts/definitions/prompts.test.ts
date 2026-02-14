import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import {
  DIAGNOSE_INSTRUCTIONS,
  HEALTH_CHECK_STEPS,
  MATURITY_STEPS,
  NOISE_STEPS,
  PERSONA,
} from "@prompts/content";
import { registerCepPrompt } from "@prompts/definitions/cep";
import { registerDiagnosePrompt } from "@prompts/definitions/diagnose";
import { registerMaturityPrompt } from "@prompts/definitions/maturity";
import { registerNoisePrompt } from "@prompts/definitions/noise";
import { describe, expect, it } from "vitest";

type PromptHandler = () => {
  description?: string;
  messages: { content: { text: string; type: string }; role: string }[];
};

function assertMcpServer(_: object): asserts _ is McpServer {
  // test mock assertion
}

function capturePrompt(registerFn: (server: McpServer) => void): {
  config: { description?: string; title?: string };
  handler: PromptHandler;
  name: string;
} {
  let captured:
    | { config: Record<string, unknown>; handler: PromptHandler; name: string }
    | undefined;
  const mockServer = {
    registerPrompt: (
      name: string,
      config: Record<string, unknown>,
      handler: PromptHandler
    ) => {
      captured = { config, handler, name };
    },
  };
  assertMcpServer(mockServer);
  registerFn(mockServer);
  if (!captured) {
    throw new Error("prompt not registered");
  }
  return captured;
}

function promptText(handler: PromptHandler): string {
  return handler().messages[0].content.text;
}

describe("prompt definitions", () => {
  describe("cep", () => {
    const { config, handler, name } = capturePrompt(registerCepPrompt);

    it("registers with name 'cep'", () => {
      expect(name).toBe("cep");
    });

    it("has title and description", () => {
      expect(config.title).toBe("Chrome Enterprise Premium");
      expect(config.description).toContain("diagnostics");
    });

    it("returns a single user message with persona and health check steps", () => {
      const result = handler();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      const text = promptText(handler);
      expect(text).toContain(PERSONA);
      expect(text).toContain(HEALTH_CHECK_STEPS);
    });

    it("includes sub-command hints", () => {
      const text = promptText(handler);
      expect(text).toContain("/cep:maturity");
      expect(text).toContain("/cep:noise");
    });
  });

  describe("cep:diagnose", () => {
    const { config, handler, name } = capturePrompt(registerDiagnosePrompt);

    it("registers with name 'cep:diagnose'", () => {
      expect(name).toBe("cep:diagnose");
    });

    it("has title and description", () => {
      expect(config.title).toBe("Diagnose Environment");
      expect(config.description).toContain("parallel health check");
    });

    it("returns diagnose instructions with parallel execution phases", () => {
      const text = promptText(handler);
      expect(text).toContain(DIAGNOSE_INSTRUCTIONS);
      expect(text).toContain("Phase 1");
      expect(text).toContain("parallelism");
    });
  });

  describe("cep:maturity", () => {
    const { config, handler, name } = capturePrompt(registerMaturityPrompt);

    it("registers with name 'cep:maturity'", () => {
      expect(name).toBe("cep:maturity");
    });

    it("has title and description", () => {
      expect(config.title).toBe("DLP Maturity Assessment");
      expect(config.description).toContain("maturity");
    });

    it("returns maturity steps with tool names", () => {
      const text = promptText(handler);
      expect(text).toContain(MATURITY_STEPS);
      expect(text).toContain("list_dlp_rules");
    });
  });

  describe("cep:noise", () => {
    const { config, handler, name } = capturePrompt(registerNoisePrompt);

    it("registers with name 'cep:noise'", () => {
      expect(name).toBe("cep:noise");
    });

    it("has title and description", () => {
      expect(config.title).toBe("DLP Noise Analysis");
      expect(config.description).toContain("noise");
    });

    it("returns noise analysis steps with tool names", () => {
      const text = promptText(handler);
      expect(text).toContain(NOISE_STEPS);
      expect(text).toContain("list_dlp_rules");
    });
  });
});
