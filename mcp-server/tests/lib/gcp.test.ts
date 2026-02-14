import { checkGCP } from "@lib/gcp";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function okResponse(body: string): Response {
  return new Response(body);
}

function errorResponse(status: number): Response {
  return new Response(null, { status });
}

describe("gcp", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  describe("checkGCP", () => {
    it("returns project and region when metadata is available", async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse("my-project"))
        .mockResolvedValueOnce(
          okResponse("projects/123456/regions/us-central1")
        );

      const result = await checkGCP();
      expect(result).toStrictEqual({
        project: "my-project",
        region: "us-central1",
      });
    });

    it("returns null when fetch throws (not on GCP)", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await checkGCP();
      expect(result).toBeNull();
    });

    it("returns null when projectId is empty", async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse(""))
        .mockResolvedValueOnce(
          okResponse("projects/123456/regions/us-central1")
        );

      const result = await checkGCP();
      expect(result).toBeNull();
    });

    it("returns null when regionPath is empty", async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse("my-project"))
        .mockResolvedValueOnce(okResponse(""));

      const result = await checkGCP();
      expect(result).toBeNull();
    });

    it("falls back to DEFAULT_REGION when region path has no slash", async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse("my-project"))
        .mockResolvedValueOnce(okResponse("us-east1"));

      const result = await checkGCP();
      expect(result).toStrictEqual({
        project: "my-project",
        region: "us-east1",
      });
    });

    it("returns null when metadata server returns non-ok status", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404));

      const result = await checkGCP();
      expect(result).toBeNull();
    });
  });
});
