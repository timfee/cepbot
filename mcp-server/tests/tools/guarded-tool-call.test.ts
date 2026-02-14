import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lib/api/admin-sdk", () => ({
  getCustomerId: vi.fn(),
}));

vi.mock("@lib/server-state", () => ({
  formatDegradedModeError: vi.fn().mockReturnValue("degraded error text"),
  getServerState: vi.fn().mockReturnValue({ status: "healthy" }),
}));

const { getCustomerId } = await import("@lib/api/admin-sdk");
const { getServerState, formatDegradedModeError } =
  await import("@lib/server-state");
const { CustomerIdCache, customerIdCache, guardedToolCall } =
  await import("@tools/guarded-tool-call");

const noopContext = { requestInfo: undefined };

const testTransform = (params: Record<string, unknown>) => ({
  ...params,
  displayName: `prefix-${String(params.displayName)}`,
});

const testValidate = (): void => {
  throw new Error("validation failed");
};

describe("guarded-tool-call", () => {
  beforeEach(() => {
    vi.mocked(getCustomerId).mockReset();
    vi.mocked(getServerState).mockReturnValue({ status: "healthy" } as never);
    customerIdCache.clear();
  });

  describe("customerIdCache", () => {
    it("is an instance of CustomerIdCache", () => {
      expect(customerIdCache).toBeInstanceOf(CustomerIdCache);
    });

    it("stores and retrieves values", () => {
      const cache = new CustomerIdCache();
      expect(cache.get()).toBeNull();
      cache.set("C012345");
      expect(cache.get()).toBe("C012345");
    });

    it("clears cached value", () => {
      const cache = new CustomerIdCache();
      cache.set("C012345");
      cache.clear();
      expect(cache.get()).toBeNull();
    });
  });

  describe("guardedToolCall", () => {
    it("calls handler and returns result", async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });

      const wrapped = guardedToolCall({ handler });
      const result = await wrapped({ customerId: "C012345" }, noopContext);

      expect(result).toStrictEqual({
        content: [{ text: "ok", type: "text" }],
      });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: "C012345" }),
        noopContext
      );
    });

    it("caches provided customerId", async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });

      const wrapped = guardedToolCall({ handler });
      await wrapped({ customerId: "C099" }, noopContext);

      expect(customerIdCache.get()).toBe("C099");
    });

    it("auto-resolves customerId from cache", async () => {
      customerIdCache.set("C-cached");
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });

      const wrapped = guardedToolCall({ handler });
      await wrapped({}, noopContext);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: "C-cached" }),
        noopContext
      );
    });

    it("auto-resolves customerId from API when cache is empty", async () => {
      // Reset cache to truly empty
      customerIdCache.clear();

      vi.mocked(getCustomerId).mockResolvedValue({ id: "C-api" });
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });

      const wrapped = guardedToolCall({ handler });
      await wrapped({}, noopContext);

      expect(getCustomerId).toHaveBeenCalledWith(null);
    });

    it("skips auto-resolve when skipAutoResolve is true", async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });

      const wrapped = guardedToolCall({ handler, skipAutoResolve: true });
      await wrapped({}, noopContext);

      expect(getCustomerId).not.toHaveBeenCalled();
    });

    it("normalizes orgUnitId by stripping id: prefix", async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });

      const wrapped = guardedToolCall({ handler, skipAutoResolve: true });
      await wrapped({ orgUnitId: "id:12345" }, noopContext);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ orgUnitId: "12345" }),
        noopContext
      );
    });

    it("applies custom transform", async () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });
      const wrapped = guardedToolCall({
        handler,
        skipAutoResolve: true,
        transform: testTransform,
      });
      await wrapped({ displayName: "test" }, noopContext);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: "prefix-test" }),
        noopContext
      );
    });

    it("applies validate and throws on failure", async () => {
      const handler = vi.fn();
      const wrapped = guardedToolCall({
        handler,
        skipAutoResolve: true,
        validate: testValidate,
      });
      const result = await wrapped({}, noopContext);

      expect(result).toStrictEqual({
        content: [{ text: "Error: validation failed", type: "text" }],
        isError: true,
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it("catches handler errors and returns error result", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("handler failed"));

      const wrapped = guardedToolCall({ handler, skipAutoResolve: true });
      const result = await wrapped({}, noopContext);

      expect(result).toStrictEqual({
        content: [{ text: "Error: handler failed", type: "text" }],
        isError: true,
      });
    });

    it("handles non-Error throws", async () => {
      const handler = vi.fn().mockRejectedValue("string error");

      const wrapped = guardedToolCall({ handler, skipAutoResolve: true });
      const result = await wrapped({}, noopContext);

      expect(result).toStrictEqual({
        content: [{ text: "Error: string error", type: "text" }],
        isError: true,
      });
    });

    it("does not cache when getCustomerId returns null", async () => {
      customerIdCache.clear();
      vi.mocked(getCustomerId).mockResolvedValue(null);
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });

      const wrapped = guardedToolCall({ handler });
      await wrapped({}, noopContext);

      expect(customerIdCache.get()).toBeNull();
    });

    it("silently catches auto-resolve API failures", async () => {
      customerIdCache.clear();
      vi.mocked(getCustomerId).mockRejectedValue(new Error("api down"));
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });

      const wrapped = guardedToolCall({ handler });
      const result = await wrapped({}, noopContext);

      expect(result).toStrictEqual({
        content: [{ text: "ok", type: "text" }],
      });
    });

    it("extracts auth token from context", async () => {
      customerIdCache.clear();
      vi.mocked(getCustomerId).mockResolvedValue({ id: "C-from-api" });
      const handler = vi.fn().mockResolvedValue({
        content: [{ text: "ok", type: "text" as const }],
      });

      const wrapped = guardedToolCall({ handler });
      await wrapped(
        {},
        { requestInfo: { headers: { authorization: "Bearer test-tok" } } }
      );

      expect(getCustomerId).toHaveBeenCalledWith("test-tok");
    });

    it("returns degraded mode error when server is degraded", async () => {
      const error = {
        agentAction: "Fix credentials",
        problem: "ADC missing",
        type: "adc_credentials" as const,
      };
      vi.mocked(getServerState).mockReturnValue({
        error,
        status: "degraded",
      } as never);
      vi.mocked(formatDegradedModeError).mockReturnValue("degraded error text");

      const handler = vi.fn();
      const wrapped = guardedToolCall({ handler, skipAutoResolve: true });
      const result = await wrapped({}, noopContext);

      expect(result).toStrictEqual({
        content: [{ text: "degraded error text", type: "text" }],
        isError: true,
      });
      expect(handler).not.toHaveBeenCalled();
      expect(formatDegradedModeError).toHaveBeenCalledWith(error);
    });
  });
});
