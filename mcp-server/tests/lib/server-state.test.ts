import type { BootstrapError } from "@lib/server-state";

import {
  _resetServerStateForTesting,
  formatDegradedModeError,
  getServerState,
  setServerDegraded,
  setServerHealthy,
} from "@lib/server-state";
import { describe, expect, it, beforeEach } from "vitest";

describe("server-state", () => {
  beforeEach(() => {
    _resetServerStateForTesting();
  });

  describe("getServerState", () => {
    it("returns booting by default", () => {
      expect(getServerState()).toStrictEqual({ status: "booting" });
    });
  });

  describe("setServerHealthy", () => {
    it("transitions to healthy state", () => {
      setServerHealthy("my-project", "us-central1");
      expect(getServerState()).toStrictEqual({
        projectId: "my-project",
        region: "us-central1",
        status: "healthy",
      });
    });
  });

  describe("setServerDegraded", () => {
    it("transitions to degraded state", () => {
      const error: BootstrapError = {
        agentAction: "Tell the user to fix it",
        problem: "Something broke",
        type: "unknown",
      };
      setServerDegraded(error);
      const state = getServerState();
      expect(state).toStrictEqual({ error, status: "degraded" });
    });
  });

  describe("_resetServerStateForTesting", () => {
    it("resets to booting state", () => {
      setServerHealthy("proj", "region");
      _resetServerStateForTesting();
      expect(getServerState()).toStrictEqual({ status: "booting" });
    });
  });

  describe("formatDegradedModeError", () => {
    it("formats basic error with problem and action", () => {
      const error: BootstrapError = {
        agentAction: "Offer to run: gcloud auth login",
        problem: "ADC not configured",
        type: "adc_credentials",
      };
      const text = formatDegradedModeError(error);
      expect(text).toContain("## Problem");
      expect(text).toContain("ADC not configured");
      expect(text).toContain("## AGENT ACTION REQUIRED");
      expect(text).toContain("Offer to run: gcloud auth login");
      expect(text).toContain("## Recovery");
      expect(text).toContain("retry_bootstrap");
    });

    it("includes failed APIs section when present", () => {
      const error: BootstrapError = {
        agentAction: "Run gcloud services enable",
        apiFailures: [
          "admin.googleapis.com",
          "chromemanagement.googleapis.com",
        ],
        problem: "APIs not enabled",
        type: "api_enablement",
      };
      const text = formatDegradedModeError(error);
      expect(text).toContain("## Failed APIs");
      expect(text).toContain("- admin.googleapis.com");
      expect(text).toContain("- chromemanagement.googleapis.com");
    });

    it("omits failed APIs section when empty", () => {
      const error: BootstrapError = {
        agentAction: "Fix it",
        apiFailures: [],
        problem: "Broke",
        type: "unknown",
      };
      const text = formatDegradedModeError(error);
      expect(text).not.toContain("## Failed APIs");
    });

    it("omits failed APIs section when undefined", () => {
      const error: BootstrapError = {
        agentAction: "Fix it",
        problem: "Broke",
        type: "unknown",
      };
      const text = formatDegradedModeError(error);
      expect(text).not.toContain("## Failed APIs");
    });
  });
});
