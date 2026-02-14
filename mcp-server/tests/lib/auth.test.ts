import type { GoogleAuth as GoogleAuthType } from "google-auth-library";

import { verifyADCCredentials, verifyTokenScopes } from "@lib/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("google-auth-library", () => ({
  GoogleAuth: vi.fn(),
}));

const { GoogleAuth } = await import("google-auth-library");
const MockGoogleAuth = vi.mocked(GoogleAuth);

function assertGoogleAuth(_: object): asserts _ is GoogleAuthType {
  // test mock assertion
}

function mockAuth(getClient: unknown) {
  MockGoogleAuth.mockImplementation(function fakeGoogleAuth() {
    const auth = { getClient };
    assertGoogleAuth(auth);
    return auth;
  });
}

describe("verifyADCCredentials", () => {
  it("returns ok with token when credentials are valid", async () => {
    mockAuth(
      vi.fn().mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: "tok-123" }),
      })
    );

    const result = await verifyADCCredentials();
    expect(result).toStrictEqual({ ok: true, token: "tok-123" });
  });

  it("returns failure when token is null", async () => {
    mockAuth(
      vi.fn().mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: null }),
      })
    );

    const result = await verifyADCCredentials();
    expect(result).toMatchObject({
      ok: false,
      reason: "ADC produced no access token",
    });
  });

  it("returns failure with reason when an Error is thrown", async () => {
    mockAuth(vi.fn().mockRejectedValue(new Error("no creds")));

    const result = await verifyADCCredentials();
    expect(result).toMatchObject({
      cause: expect.any(Error),
      ok: false,
      reason: "no creds",
    });
  });

  it("returns failure with stringified reason for non-Error throws", async () => {
    mockAuth(vi.fn().mockRejectedValue("string error"));

    const result = await verifyADCCredentials();
    expect(result).toMatchObject({
      cause: "string error",
      ok: false,
      reason: "string error",
    });
  });
});

describe("verifyTokenScopes", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns ok when all required scopes are present", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ scope: "scope_a scope_b scope_c" }), {
        status: 200,
      })
    );

    const result = await verifyTokenScopes("tok", ["scope_a", "scope_b"]);
    expect(result).toStrictEqual({
      granted: ["scope_a", "scope_b", "scope_c"],
      missing: [],
      ok: true,
      source: "tokeninfo",
    });
  });

  it("returns missing scopes when token lacks them", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ scope: "scope_a" }), { status: 200 })
    );

    const result = await verifyTokenScopes("tok", ["scope_a", "scope_b"]);
    expect(result).toStrictEqual({
      granted: ["scope_a"],
      missing: ["scope_b"],
      ok: false,
      source: "tokeninfo",
    });
  });

  it("handles missing scope field from tokeninfo", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    const result = await verifyTokenScopes("tok", ["scope_a"]);
    expect(result).toStrictEqual({
      granted: [],
      missing: ["scope_a"],
      ok: false,
      source: "tokeninfo",
    });
  });

  it("handles empty scope string from tokeninfo", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ scope: "" }), { status: 200 })
    );

    const result = await verifyTokenScopes("tok", ["scope_a"]);
    expect(result).toStrictEqual({
      granted: [],
      missing: ["scope_a"],
      ok: false,
      source: "tokeninfo",
    });
  });

  it("falls back gracefully when tokeninfo returns an error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("bad token", { status: 400 })
    );

    const result = await verifyTokenScopes("tok", ["scope_a"]);
    expect(result).toStrictEqual({
      granted: [],
      missing: [],
      ok: true,
      source: "unavailable",
    });
  });

  it("falls back gracefully when fetch throws", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("network error"));

    const result = await verifyTokenScopes("tok", ["scope_a"]);
    expect(result).toStrictEqual({
      granted: [],
      missing: [],
      ok: true,
      source: "unavailable",
    });
  });
});
