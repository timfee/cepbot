import {
  DIAGNOSE_INSTRUCTIONS,
  HEALTH_CHECK_STEPS,
  MATURITY_STEPS,
  NOISE_STEPS,
  PERSONA,
  buildPromptResult,
} from "@prompts/content";
import { describe, expect, it } from "vitest";

describe("content", () => {
  describe("buildPromptResult", () => {
    it("returns a single user-role message", () => {
      const result = buildPromptResult("Do the thing.");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
    });

    it("combines persona and instructions in the message", () => {
      const result = buildPromptResult("Do the thing.");
      const text = (result.messages[0].content as { text: string }).text;
      expect(text).toContain(PERSONA);
      expect(text).toContain("Do the thing.");
    });

    it("passes through description when provided", () => {
      const result = buildPromptResult("steps", "A helpful description");
      expect(result.description).toBe("A helpful description");
    });

    it("leaves description undefined when omitted", () => {
      const result = buildPromptResult("steps");
      expect(result.description).toBeUndefined();
    });
  });

  describe("constants", () => {
    it("HEALTH_CHECK_STEPS is directive and names specific tools", () => {
      expect(HEALTH_CHECK_STEPS).toContain("Do not list your tools");
      expect(HEALTH_CHECK_STEPS).toContain("list_org_units");
      expect(HEALTH_CHECK_STEPS).toContain("get_connector_policy");
      expect(HEALTH_CHECK_STEPS).toContain("DLP");
    });

    it("DIAGNOSE_INSTRUCTIONS contains parallel execution phases", () => {
      expect(DIAGNOSE_INSTRUCTIONS).toContain("Do not list your tools");
      expect(DIAGNOSE_INSTRUCTIONS).toContain("Phase 1");
      expect(DIAGNOSE_INSTRUCTIONS).toContain("Phase 2");
      expect(DIAGNOSE_INSTRUCTIONS).toContain("Phase 3");
      expect(DIAGNOSE_INSTRUCTIONS).toContain("list_org_units");
      expect(DIAGNOSE_INSTRUCTIONS).toContain("parallelism");
    });

    it("MATURITY_STEPS is directive and names specific tools", () => {
      expect(MATURITY_STEPS).toContain("Do not ask");
      expect(MATURITY_STEPS).toContain("list_dlp_rules");
      expect(MATURITY_STEPS).toContain("maturity");
    });

    it("NOISE_STEPS is directive and names specific tools", () => {
      expect(NOISE_STEPS).toContain("Do not ask");
      expect(NOISE_STEPS).toContain("list_dlp_rules");
      expect(NOISE_STEPS).toContain("false positive");
    });
  });
});
