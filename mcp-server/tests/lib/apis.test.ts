import type { ProgressCallback } from "@lib/apis";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@lib/clients", () => ({
  enableService: vi.fn().mockResolvedValue(undefined),
  getServiceState: vi.fn().mockResolvedValue("ENABLED"),
}));

const { setTimeout: mockDelay } = await import("node:timers/promises");
const { enableService, getServiceState } = await import("@lib/clients");
const {
  callWithRetry,
  createMcpLogger,
  createProgressLogger,
  enableApiWithRetry,
  ensureApisEnabled,
} = await import("@lib/apis");

function grpcError(code: number): Error & { code: number } {
  return Object.assign(new Error("permission denied"), { code });
}

describe("apis", () => {
  beforeEach(() => {
    vi.mocked(mockDelay).mockClear();
    vi.mocked(getServiceState).mockReset().mockResolvedValue("ENABLED");
    vi.mocked(enableService).mockReset().mockResolvedValue();
  });

  describe("callWithRetry", () => {
    it("returns result on first success", async () => {
      const result = await callWithRetry(
        async () => Promise.resolve("ok"),
        "test"
      );
      expect(result).toBe("ok");
    });

    it("retries on PERMISSION_DENIED and eventually succeeds", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(grpcError(7))
        .mockResolvedValueOnce("ok");

      const result = await callWithRetry(fn, "test");
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("throws immediately on non-PERMISSION_DENIED errors", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("other"));

      await expect(callWithRetry(fn, "test")).rejects.toThrow("other");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws on non-grpc error objects", async () => {
      const fn = vi.fn().mockRejectedValue("string error");

      await expect(callWithRetry(fn, "test")).rejects.toBe("string error");
    });

    it("throws on error with non-numeric code", async () => {
      const error = { code: "not-a-number" };
      const fn = vi.fn().mockRejectedValue(error);

      await expect(callWithRetry(fn, "test")).rejects.toBe(error);
    });

    it("throws on null error", async () => {
      const fn = vi.fn().mockRejectedValue(null);

      await expect(callWithRetry(fn, "test")).rejects.toBeNull();
    });

    it("exhausts retries and throws after MAX_ATTEMPTS", async () => {
      const fn = vi.fn().mockRejectedValue(grpcError(7));

      await expect(callWithRetry(fn, "test")).rejects.toThrow(
        "permission denied"
      );
      // 1 initial + 7 retries = 8 total calls
      expect(fn).toHaveBeenCalledTimes(8);
    });

    it("uses 15s backoff for first retry, then exponential", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(grpcError(7))
        .mockRejectedValueOnce(grpcError(7))
        .mockRejectedValueOnce(grpcError(7))
        .mockResolvedValueOnce("ok");

      await callWithRetry(fn, "test");

      const { calls } = vi.mocked(mockDelay).mock;
      expect(calls[0][0]).toBe(15_000);
      expect(calls[1][0]).toBe(1000);
      expect(calls[2][0]).toBe(2000);
    });

    it("calls progress callback on each retry", async () => {
      const progress: ProgressCallback = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(grpcError(7))
        .mockResolvedValueOnce("ok");

      await callWithRetry(fn, "myOp", progress);

      expect(progress).toHaveBeenCalledTimes(1);
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.stringContaining("myOp"),
          level: "warn",
        })
      );
    });
  });

  describe("enableApiWithRetry", () => {
    it("succeeds when API is already enabled", async () => {
      await expect(
        enableApiWithRetry("proj", "some.api", "tok")
      ).resolves.toBeUndefined();
    });

    it("enables a disabled API", async () => {
      vi.mocked(getServiceState)
        .mockResolvedValueOnce("DISABLED")
        .mockResolvedValue("ENABLED");

      await enableApiWithRetry("proj", "some.api", "tok");
      expect(enableService).toHaveBeenCalledWith("proj", "some.api", "tok", undefined);
    });

    it("retries once on first failure then succeeds", async () => {
      const progress: ProgressCallback = vi.fn();
      let callCount = 0;
      vi.mocked(getServiceState).mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error("transient");
        }
        return "ENABLED";
      });

      await enableApiWithRetry("proj", "some.api", "tok", progress);
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({ level: "warn" })
      );
    });

    it("throws after retry also fails", async () => {
      const progress: ProgressCallback = vi.fn();
      vi.mocked(getServiceState).mockRejectedValue(new Error("permanent"));

      await expect(
        enableApiWithRetry("proj", "some.api", "tok", progress)
      ).rejects.toThrow("Failed to ensure API");
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({ level: "error" })
      );
    });

    it("throws when post-enablement verification fails", async () => {
      vi.mocked(getServiceState).mockResolvedValue("DISABLED");

      await expect(
        enableApiWithRetry("proj", "some.api", "tok")
      ).rejects.toThrow("Failed to ensure API");
    });

    it("reports progress when enabling", async () => {
      const progress: ProgressCallback = vi.fn();
      vi.mocked(getServiceState)
        .mockResolvedValueOnce("DISABLED")
        .mockResolvedValue("ENABLED");

      await enableApiWithRetry("proj", "some.api", "tok", progress);
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.stringContaining("not enabled"),
          level: "info",
        })
      );
    });
  });

  describe("ensureApisEnabled", () => {
    it("enables prerequisites then enables requested APIs", async () => {
      const progress: ProgressCallback = vi.fn();

      const failed = await ensureApisEnabled(
        "proj",
        ["custom.api"],
        "tok",
        progress
      );

      expect(failed).toEqual([]);
      // Prerequisite API is called with skipQuotaProject=true
      expect(getServiceState).toHaveBeenCalledWith(
        "proj",
        "serviceusage.googleapis.com",
        "tok",
        true
      );
      // Dependent APIs are called without skipQuotaProject
      expect(getServiceState).toHaveBeenCalledWith(
        "proj",
        "custom.api",
        "tok",
        undefined
      );
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({ data: "All required APIs are enabled." })
      );
    });

    it("reports checking progress", async () => {
      const progress: ProgressCallback = vi.fn();

      const failed = await ensureApisEnabled("proj", [], "tok", progress);

      expect(failed).toEqual([]);
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({
          data: "Checking and enabling required APIs...",
        })
      );
    });

    it("returns failed APIs when enablement fails", async () => {
      const progress: ProgressCallback = vi.fn();
      vi.mocked(getServiceState).mockRejectedValue(new Error("permanent"));

      const failed = await ensureApisEnabled(
        "proj",
        ["custom.api"],
        "tok",
        progress
      );

      expect(failed).toContain("serviceusage.googleapis.com");
      expect(failed).toContain("custom.api");
    });

    it("returns only dependent API failures when prerequisites succeed", async () => {
      const progress: ProgressCallback = vi.fn();
      let callCount = 0;
      vi.mocked(getServiceState).mockImplementation(async () => {
        callCount += 1;
        // First call: prerequisite check — succeed
        if (callCount === 1) {
          return "ENABLED";
        }
        // Subsequent calls: dependent API check — fail
        throw new Error("api check failed");
      });

      const failed = await ensureApisEnabled(
        "proj",
        ["custom.api"],
        "tok",
        progress
      );

      expect(failed).not.toContain("serviceusage.googleapis.com");
      expect(failed).toContain("custom.api");
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.stringContaining("Failed to enable API [custom.api]"),
          level: "error",
        })
      );
    });
  });

  describe("createProgressLogger", () => {
    const originalError = console.error;

    afterEach(() => {
      console.error = originalError;
    });

    it("creates a callback that logs to stderr with tag", () => {
      const spy = vi.fn();
      console.error = spy;

      const logger = createProgressLogger("test-tag");
      logger({ data: "hello world", level: "info" });

      expect(spy).toHaveBeenCalledWith("[test-tag] [info] hello world");
    });
  });

  describe("createMcpLogger", () => {
    it("sends structured log messages via MCP logging channel", () => {
      const mockServer = { sendLoggingMessage: vi.fn() };
      const logger = createMcpLogger(mockServer as never, "test-logger");
      logger({ data: "checking credentials", level: "info" });

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        data: "checking credentials",
        level: "info",
        logger: "test-logger",
      });
    });

    it("maps warn level to syslog warning", () => {
      const mockServer = { sendLoggingMessage: vi.fn() };
      const logger = createMcpLogger(mockServer as never, "test-logger");
      logger({ data: "retrying...", level: "warn" });

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        data: "retrying...",
        level: "warning",
        logger: "test-logger",
      });
    });

    it("passes error level through unchanged", () => {
      const mockServer = { sendLoggingMessage: vi.fn() };
      const logger = createMcpLogger(mockServer as never, "test-logger");
      logger({ data: "failed", level: "error" });

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        data: "failed",
        level: "error",
        logger: "test-logger",
      });
    });
  });
});
