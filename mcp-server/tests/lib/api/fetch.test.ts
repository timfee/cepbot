import type { GoogleAuth as GoogleAuthType } from "google-auth-library";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("google-auth-library", () => ({
  GoogleAuth: vi.fn(),
}));

const { GoogleAuth } = await import("google-auth-library");
const MockGoogleAuth = vi.mocked(GoogleAuth);

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { GoogleApiError, resetCachedAuth, googleFetch } =
  await import("@lib/api/fetch");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function textResponse(text: string, status: number): Response {
  return new Response(text, { status });
}

function assertGoogleAuth(_: object): asserts _ is GoogleAuthType {
  // test mock assertion
}

function mockADC(token: string | null, quotaProjectId?: string): void {
  MockGoogleAuth.mockImplementation(function fakeAuth() {
    const auth = {
      getClient: vi.fn().mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token }),
        quotaProjectId,
      }),
    };
    assertGoogleAuth(auth);
    return auth;
  });
}

describe("fetch", () => {
  beforeEach(() => {
    resetCachedAuth();
  });

  afterEach(() => {
    mockFetch.mockReset();
    MockGoogleAuth.mockReset();
  });

  describe("googleApiError", () => {
    it("sets code to PERMISSION_DENIED (7) for HTTP 403", () => {
      const error = new GoogleApiError(403, "forbidden");
      expect(error.code).toBe(7);
      expect(error.status).toBe(403);
      expect(error.message).toBe("forbidden");
      expect(error.name).toBe("GoogleApiError");
    });

    it("uses status as code for non-403 errors", () => {
      const error = new GoogleApiError(404, "not found");
      expect(error.code).toBe(404);
      expect(error.status).toBe(404);
    });
  });

  describe("googleFetch", () => {
    it("uses provided accessToken", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: "123" }));

      const result = await googleFetch<{ id: string }>(
        "https://api.example.com",
        {
          accessToken: "my-token",
        }
      );

      expect(result).toStrictEqual({ id: "123" });
      expect(mockFetch).toHaveBeenCalledWith("https://api.example.com", {
        body: undefined,
        headers: { Authorization: "Bearer my-token" },
        method: "GET",
      });
    });

    it("falls back to ADC when no token provided", async () => {
      mockADC("adc-token");
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await googleFetch("https://api.example.com");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: { Authorization: "Bearer adc-token" },
        })
      );
    });

    it("includes x-goog-user-project header when ADC has quota project", async () => {
      mockADC("adc-token", "my-project");
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await googleFetch("https://api.example.com");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: {
            Authorization: "Bearer adc-token",
            "x-goog-user-project": "my-project",
          },
        })
      );
    });

    it("throws GoogleApiError when ADC returns no token", async () => {
      mockADC(null);

      await expect(googleFetch("https://api.example.com")).rejects.toThrow(
        "Failed to obtain access token from ADC"
      );
    });

    it("sends POST with JSON body", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ created: true }));

      await googleFetch("https://api.example.com", {
        accessToken: "tok",
        body: { name: "test" },
      });

      expect(mockFetch).toHaveBeenCalledWith("https://api.example.com", {
        body: '{"name":"test"}',
        headers: {
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    });

    it("uses explicit method override", async () => {
      mockFetch.mockResolvedValue(jsonResponse({}));

      await googleFetch("https://api.example.com", {
        accessToken: "tok",
        method: "DELETE",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("returns undefined for 204 No Content", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      const result = await googleFetch("https://api.example.com", {
        accessToken: "tok",
        method: "DELETE",
      });

      expect(result).toBeUndefined();
    });

    it("throws GoogleApiError on non-ok response", async () => {
      mockFetch.mockResolvedValue(textResponse("forbidden", 403));

      await expect(
        googleFetch("https://api.example.com", { accessToken: "tok" })
      ).rejects.toMatchObject({
        code: 7,
        message: "forbidden",
        name: "GoogleApiError",
        status: 403,
      });
    });

    it("throws GoogleApiError with status as code for non-403 errors", async () => {
      mockFetch.mockResolvedValue(textResponse("not found", 404));

      await expect(
        googleFetch("https://api.example.com", { accessToken: "tok" })
      ).rejects.toMatchObject({
        code: 404,
        name: "GoogleApiError",
        status: 404,
      });
    });

    it("reuses cached GoogleAuth instance", async () => {
      let callCount = 0;
      MockGoogleAuth.mockImplementation(function fakeAuth() {
        callCount += 1;
        const auth = {
          getClient: vi.fn().mockResolvedValue({
            getAccessToken: vi.fn().mockResolvedValue({ token: "adc-tok" }),
          }),
        };
        assertGoogleAuth(auth);
        return auth;
      });

      mockFetch.mockImplementation(async () =>
        Promise.resolve(jsonResponse({ ok: true }))
      );

      await googleFetch("https://api.example.com");
      await googleFetch("https://api.example.com");

      expect(callCount).toBe(1);
    });

    it("creates new GoogleAuth after resetCachedAuth", async () => {
      let callCount = 0;
      MockGoogleAuth.mockImplementation(function fakeAuth() {
        callCount += 1;
        const auth = {
          getClient: vi.fn().mockResolvedValue({
            getAccessToken: vi
              .fn()
              .mockResolvedValue({ token: `tok-${String(callCount)}` }),
            quotaProjectId: callCount === 1 ? "old-proj" : "new-proj",
          }),
        };
        assertGoogleAuth(auth);
        return auth;
      });

      mockFetch.mockImplementation(async () =>
        Promise.resolve(jsonResponse({ ok: true }))
      );

      await googleFetch("https://api.example.com");
      expect(callCount).toBe(1);
      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-goog-user-project": "old-proj",
          }),
        })
      );

      resetCachedAuth();
      await googleFetch("https://api.example.com");

      expect(callCount).toBe(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api.example.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-goog-user-project": "new-proj",
          }),
        })
      );
    });
  });
});
