import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@lib/api/fetch", () => ({
  GoogleApiError: class extends Error {
    readonly code: number;
    readonly status: number;
    constructor(status: number, body: string) {
      super(body);
      this.status = status;
      this.code = status;
    }
  },
  googleFetch: vi.fn(),
}));

const { googleFetch } = await import("@lib/api/fetch");
const { createProject, enableService, getServiceState } =
  await import("@lib/clients");

describe("clients", () => {
  beforeEach(() => {
    vi.mocked(googleFetch).mockReset();
  });

  describe("getServiceState", () => {
    it("returns the service state", async () => {
      vi.mocked(googleFetch).mockResolvedValue({ state: "ENABLED" });

      const state = await getServiceState("proj", "some.api", "tok");
      expect(state).toBe("ENABLED");
      expect(googleFetch).toHaveBeenCalledWith(
        "https://serviceusage.googleapis.com/v1/projects/proj/services/some.api",
        { accessToken: "tok" }
      );
    });
  });

  describe("enableService", () => {
    it("enables a service and resolves when already done", async () => {
      vi.mocked(googleFetch).mockResolvedValue({ done: true });

      await expect(
        enableService("proj", "some.api", "tok")
      ).resolves.toBeUndefined();
    });

    it("polls operation until done", async () => {
      vi.mocked(googleFetch)
        .mockResolvedValueOnce({ done: false, name: "operations/123" })
        .mockResolvedValueOnce({ done: false, name: "operations/123" })
        .mockResolvedValueOnce({ done: true });

      await expect(
        enableService("proj", "some.api", "tok")
      ).resolves.toBeUndefined();
      expect(googleFetch).toHaveBeenCalledTimes(3);
    });

    it("resolves immediately when no operation name returned", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await expect(
        enableService("proj", "some.api", "tok")
      ).resolves.toBeUndefined();
      expect(googleFetch).toHaveBeenCalledTimes(1);
    });

    it("throws when polling times out", async () => {
      vi.mocked(googleFetch).mockResolvedValue({
        done: false,
        name: "operations/stuck",
      });

      await expect(enableService("proj", "some.api", "tok")).rejects.toThrow(
        "Operation timed out"
      );
    });
  });

  describe("createProject", () => {
    it("returns projectId from completed operation", async () => {
      vi.mocked(googleFetch).mockResolvedValue({
        done: true,
        response: { projectId: "my-proj" },
      });

      const id = await createProject("tok", "my-proj", "organizations/123");
      expect(id).toBe("my-proj");
      expect(googleFetch).toHaveBeenCalledWith(
        "https://cloudresourcemanager.googleapis.com/v3/projects",
        {
          accessToken: "tok",
          body: { parent: "organizations/123", projectId: "my-proj" },
          method: "POST",
        }
      );
    });

    it("polls pending operation and returns projectId", async () => {
      vi.mocked(googleFetch)
        .mockResolvedValueOnce({ done: false, name: "operations/456" })
        .mockResolvedValueOnce({
          done: true,
          response: { projectId: "my-proj" },
        });

      const id = await createProject("tok", "my-proj");
      expect(id).toBe("my-proj");
      expect(googleFetch).toHaveBeenCalledTimes(2);
    });

    it("falls back to input projectId when response is missing", async () => {
      vi.mocked(googleFetch).mockResolvedValue({ done: true });

      const id = await createProject("tok", "fallback-proj");
      expect(id).toBe("fallback-proj");
    });

    it("falls back to input projectId when polled response is missing", async () => {
      vi.mocked(googleFetch)
        .mockResolvedValueOnce({ done: false, name: "operations/789" })
        .mockResolvedValueOnce({ done: true });

      const id = await createProject("tok", "poll-fallback");
      expect(id).toBe("poll-fallback");
    });

    it("creates project without parent", async () => {
      vi.mocked(googleFetch).mockResolvedValue({
        done: true,
        response: { projectId: "no-parent" },
      });

      await createProject("tok", "no-parent");
      expect(googleFetch).toHaveBeenCalledWith(
        "https://cloudresourcemanager.googleapis.com/v3/projects",
        {
          accessToken: "tok",
          body: { projectId: "no-parent" },
          method: "POST",
        }
      );
    });
  });
});
