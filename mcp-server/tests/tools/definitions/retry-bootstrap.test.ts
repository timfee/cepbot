import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lib/api/fetch", () => ({
  resetCachedAuth: vi.fn(),
}));

vi.mock("@lib/apis", () => ({
  createProgressLogger: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("@lib/bootstrap", () => ({
  bootstrap: vi.fn(),
}));

vi.mock("@lib/server-state", () => ({
  formatDegradedModeError: vi.fn().mockReturnValue("formatted error"),
  setServerDegraded: vi.fn(),
  setServerHealthy: vi.fn(),
}));

vi.mock("@tools/guarded-tool-call", () => ({
  customerIdCache: { clear: vi.fn(), get: vi.fn(), set: vi.fn() },
}));

const { resetCachedAuth } = await import("@lib/api/fetch");
const { bootstrap } = await import("@lib/bootstrap");
const { formatDegradedModeError, setServerDegraded, setServerHealthy } =
  await import("@lib/server-state");
const { customerIdCache } = await import("@tools/guarded-tool-call");

// Dynamically import after mocks to capture the registered handler
let registeredHandler: () => Promise<unknown>;

const mockServer = {
  registerTool: vi.fn(
    (_name: string, _meta: unknown, handler: () => Promise<unknown>) => {
      registeredHandler = handler;
    }
  ),
};

// Import and register
const { registerRetryBootstrapTool } =
  await import("@tools/definitions/retry-bootstrap");

describe("retry-bootstrap", () => {
  beforeEach(() => {
    vi.mocked(resetCachedAuth).mockReset();
    vi.mocked(bootstrap).mockReset();
    vi.mocked(setServerHealthy).mockReset();
    vi.mocked(setServerDegraded).mockReset();
    vi.mocked(customerIdCache.clear).mockReset();
    vi.mocked(customerIdCache.set).mockReset();
    vi.mocked(formatDegradedModeError)
      .mockReset()
      .mockReturnValue("formatted error");

    // Re-register to capture handler
    registerRetryBootstrapTool(mockServer as never);
  });

  it("registers the retry_bootstrap tool", () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "retry_bootstrap",
      expect.objectContaining({
        title: "Retry Bootstrap",
      }),
      expect.any(Function)
    );
  });

  it("clears all cached state before re-running bootstrap", async () => {
    const callOrder: string[] = [];
    vi.mocked(resetCachedAuth).mockImplementation(() => {
      callOrder.push("resetCachedAuth");
    });
    vi.mocked(customerIdCache.clear).mockImplementation(() => {
      callOrder.push("clearCustomerIdCache");
    });
    vi.mocked(bootstrap).mockImplementation(async () => {
      callOrder.push("bootstrap");
      return { customerId: "C1", ok: true, projectId: "p", region: "r" };
    });

    await registeredHandler();

    expect(resetCachedAuth).toHaveBeenCalled();
    expect(customerIdCache.clear).toHaveBeenCalled();
    expect(callOrder).toStrictEqual([
      "resetCachedAuth",
      "clearCustomerIdCache",
      "bootstrap",
    ]);
  });

  it("returns success when bootstrap succeeds", async () => {
    vi.mocked(bootstrap).mockResolvedValue({
      customerId: "C123",
      ok: true,
      projectId: "proj-1",
      region: "us-central1",
    });

    const result = await registeredHandler();

    expect(setServerHealthy).toHaveBeenCalledWith("proj-1", "us-central1");
    expect(customerIdCache.set).toHaveBeenCalledWith("C123");
    expect(result).toStrictEqual({
      content: [
        {
          text: "Bootstrap succeeded. The server is now fully operational. All tools are available.",
          type: "text",
        },
      ],
    });
  });

  it("does not cache customerId when absent", async () => {
    vi.mocked(bootstrap).mockResolvedValue({
      customerId: undefined,
      ok: true,
      projectId: "proj-1",
      region: "us-central1",
    });

    await registeredHandler();

    expect(setServerHealthy).toHaveBeenCalled();
    expect(customerIdCache.set).not.toHaveBeenCalled();
  });

  it("returns error when bootstrap fails", async () => {
    const error = {
      agentAction: "fix it",
      problem: "broken",
      type: "unknown" as const,
    };
    vi.mocked(bootstrap).mockResolvedValue({ error, ok: false });

    const result = await registeredHandler();

    expect(setServerDegraded).toHaveBeenCalledWith(error);
    expect(formatDegradedModeError).toHaveBeenCalledWith(error);
    expect(result).toStrictEqual({
      content: [
        {
          text: "Bootstrap failed again.\n\nformatted error",
          type: "text",
        },
      ],
      isError: true,
    });
  });
});
