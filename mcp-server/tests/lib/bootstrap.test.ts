import type { BootstrapResult } from "@lib/bootstrap";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lib/api/admin-sdk", () => ({
  getCustomerId: vi.fn(),
}));

vi.mock("@lib/apis", () => ({
  ensureApisEnabled: vi.fn().mockResolvedValue([]),
}));

vi.mock("@lib/auth", () => ({
  verifyADCCredentials: vi.fn(),
  verifyTokenScopes: vi.fn(),
}));

vi.mock("@lib/gcp", () => ({
  checkGCP: vi.fn(),
}));

vi.mock("@lib/gcloud", () => ({
  checkGcloudInstalled: vi.fn(),
  getGcloudProject: vi.fn().mockReturnValue(null),
  getQuotaProject: vi.fn(),
  setQuotaProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@lib/projects", () => ({
  createProject: vi.fn(),
}));

const { getCustomerId } = await import("@lib/api/admin-sdk");
const { ensureApisEnabled } = await import("@lib/apis");
const { verifyADCCredentials, verifyTokenScopes } = await import("@lib/auth");
const { checkGCP } = await import("@lib/gcp");
const {
  checkGcloudInstalled,
  getGcloudProject,
  getQuotaProject,
  setQuotaProject,
} = await import("@lib/gcloud");
const { createProject } = await import("@lib/projects");
const { bootstrap } = await import("@lib/bootstrap");

function expectFailure(
  result: BootstrapResult
): asserts result is Extract<BootstrapResult, { ok: false }> {
  expect(result.ok).toBe(false);
}

describe("bootstrap", () => {
  beforeEach(() => {
    vi.mocked(checkGcloudInstalled).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(verifyADCCredentials)
      .mockReset()
      .mockResolvedValue({ ok: true, token: "test-token" });
    vi.mocked(verifyTokenScopes)
      .mockReset()
      .mockResolvedValue({
        granted: ["s1"],
        missing: [],
        ok: true,
        source: "tokeninfo" as const,
      });
    vi.mocked(checkGCP).mockReset().mockResolvedValue(null);
    vi.mocked(getQuotaProject).mockReset().mockResolvedValue("my-project");
    vi.mocked(getGcloudProject).mockReset().mockReturnValue(null);
    vi.mocked(ensureApisEnabled).mockReset().mockResolvedValue([]);
    vi.mocked(getCustomerId).mockReset().mockResolvedValue({ id: "C012345" });
    vi.mocked(createProject).mockReset();
    vi.mocked(setQuotaProject).mockReset().mockResolvedValue();
  });

  it("succeeds with all checks passing", async () => {
    const result = await bootstrap();
    expect(result).toStrictEqual({
      customerId: "C012345",
      ok: true,
      projectId: "my-project",
      region: "us-central1",
    });
  });

  it("reports progress", async () => {
    const progress = vi.fn();
    await bootstrap(progress);
    expect(progress.mock.calls.length).toBeGreaterThan(0);
  });

  it("fails when gcloud is not installed", async () => {
    vi.mocked(checkGcloudInstalled).mockResolvedValue({
      ok: false,
      reason: "not found",
    });
    const progress = vi.fn();
    const result = await bootstrap(progress);
    expectFailure(result);
    expect(result.error.type).toBe("gcloud_missing");
    expect(result.error.problem).toContain("gcloud CLI");
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining("gcloud check failed"),
        level: "error",
      })
    );
  });

  it("fails when ADC credentials are invalid", async () => {
    vi.mocked(verifyADCCredentials).mockResolvedValue({
      ok: false,
      reason: "no creds",
    });
    const progress = vi.fn();
    const result = await bootstrap(progress);
    expectFailure(result);
    expect(result.error.type).toBe("adc_credentials");
    expect(result.error.problem).toContain("Application Default Credentials");
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining("ADC verification failed"),
        level: "error",
      })
    );
  });

  it("passes ADC token to verifyTokenScopes", async () => {
    vi.mocked(verifyADCCredentials).mockResolvedValue({
      ok: true,
      token: "my-adc-token",
    });
    await bootstrap();
    expect(verifyTokenScopes).toHaveBeenCalledWith(
      "my-adc-token",
      expect.arrayContaining(["https://www.googleapis.com/auth/cloud-platform"])
    );
  });

  it("fails when required scopes are missing", async () => {
    vi.mocked(verifyTokenScopes).mockResolvedValue({
      granted: [],
      missing: ["scope1"],
      ok: false,
      source: "tokeninfo" as const,
    });
    const progress = vi.fn();
    const result = await bootstrap(progress);
    expectFailure(result);
    expect(result.error.type).toBe("scope_missing");
    expect(result.error.problem).toContain("required OAuth scope");
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining("Missing scopes"),
        level: "error",
      })
    );
  });

  it("logs granted scopes when some are present but others missing", async () => {
    vi.mocked(verifyTokenScopes).mockResolvedValue({
      granted: ["https://www.googleapis.com/auth/cloud-platform"],
      missing: ["scope1"],
      ok: false,
      source: "tokeninfo" as const,
    });
    const progress = vi.fn();
    const result = await bootstrap(progress);
    expectFailure(result);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining("cloud-platform"),
        level: "info",
      })
    );
  });

  it("logs scope check source", async () => {
    vi.mocked(verifyTokenScopes).mockResolvedValue({
      granted: [],
      missing: ["scope1"],
      ok: false,
      source: "tokeninfo" as const,
    });
    const progress = vi.fn();
    await bootstrap(progress);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining("tokeninfo"),
      })
    );
  });

  it("uses GCP environment when available", async () => {
    vi.mocked(checkGCP).mockResolvedValue({
      project: "gcp-proj",
      region: "europe-west1",
    });
    const progress = vi.fn();
    const result = await bootstrap(progress);
    expect(result).toMatchObject({
      ok: true,
      projectId: "gcp-proj",
      region: "europe-west1",
    });
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining("GCP environment detected"),
      })
    );
  });

  it("falls back to gcloud config project when ADC has no quota project", async () => {
    vi.mocked(getQuotaProject).mockResolvedValue(null);
    vi.mocked(getGcloudProject).mockReturnValue("config-proj");

    const result = await bootstrap();
    expect(result).toMatchObject({ ok: true, projectId: "config-proj" });
    expect(setQuotaProject).toHaveBeenCalledWith("config-proj");
    expect(createProject).not.toHaveBeenCalled();
  });

  it("continues when persisting gcloud config project to ADC fails", async () => {
    vi.mocked(getQuotaProject).mockResolvedValue(null);
    vi.mocked(getGcloudProject).mockReturnValue("config-proj");
    vi.mocked(setQuotaProject).mockRejectedValue(new Error("write failed"));

    const result = await bootstrap();
    expect(result).toMatchObject({ ok: true, projectId: "config-proj" });
  });

  it("creates a project only when both ADC and gcloud config have no project", async () => {
    vi.mocked(getQuotaProject).mockResolvedValue(null);
    vi.mocked(getGcloudProject).mockReturnValue(null);
    vi.mocked(createProject).mockResolvedValue({ projectId: "new-proj" });

    const result = await bootstrap();
    expect(result).toMatchObject({ ok: true, projectId: "new-proj" });
    expect(setQuotaProject).toHaveBeenCalledWith("new-proj");
  });

  it("fails when project creation fails", async () => {
    vi.mocked(getQuotaProject).mockResolvedValue(null);
    vi.mocked(getGcloudProject).mockReturnValue(null);
    vi.mocked(createProject).mockRejectedValue(new Error("create failed"));

    const result = await bootstrap();
    expectFailure(result);
    expect(result.error.type).toBe("quota_project");
    expect(result.error.problem).toContain("create failed");
  });

  it("handles non-Error in project creation failure", async () => {
    vi.mocked(getQuotaProject).mockResolvedValue(null);
    vi.mocked(getGcloudProject).mockReturnValue(null);
    vi.mocked(createProject).mockRejectedValue("string error");

    const result = await bootstrap();
    expectFailure(result);
    expect(result.error.type).toBe("quota_project");
    expect(result.error.problem).toContain("string error");
  });

  it("passes correct projectId to ensureApisEnabled", async () => {
    vi.mocked(getQuotaProject).mockResolvedValue("adc-project");

    await bootstrap();
    const [projectId, , accessToken] =
      vi.mocked(ensureApisEnabled).mock.calls[0];
    expect(projectId).toBe("adc-project");
    expect(accessToken).toBe("");
  });

  it("passes REQUIRED_APIS to ensureApisEnabled", async () => {
    await bootstrap();
    const [, apis] = vi.mocked(ensureApisEnabled).mock.calls[0];
    expect(apis).toContain("admin.googleapis.com");
    expect(apis).toContain("chromemanagement.googleapis.com");
    expect(apis).toContain("cloudidentity.googleapis.com");
  });

  it("passes all SCOPES to verifyTokenScopes", async () => {
    await bootstrap();
    const [, scopes] = vi.mocked(verifyTokenScopes).mock.calls[0];
    expect(scopes).toContain("https://www.googleapis.com/auth/cloud-platform");
    expect(scopes).toContain(
      "https://www.googleapis.com/auth/admin.directory.customer.readonly"
    );
  });

  it("fails when API enablement returns failed APIs", async () => {
    vi.mocked(ensureApisEnabled).mockResolvedValue(["admin.googleapis.com"]);

    const progress = vi.fn();
    const result = await bootstrap(progress);
    expectFailure(result);
    expect(result.error.type).toBe("api_enablement");
    expect(result.error.apiFailures).toContain("admin.googleapis.com");
    expect(result.error.agentAction).toContain("gcloud services enable");
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining("API enablement failed"),
        level: "error",
      })
    );
  });

  it("succeeds when API enablement returns empty list", async () => {
    vi.mocked(ensureApisEnabled).mockResolvedValue([]);

    const result = await bootstrap();
    expect(result.ok).toBe(true);
  });

  it("succeeds without customer ID", async () => {
    vi.mocked(getCustomerId).mockResolvedValue(null);

    const result = await bootstrap();
    expect(result).toMatchObject({ customerId: undefined, ok: true });
  });

  it("continues when customer ID fetch fails", async () => {
    vi.mocked(getCustomerId).mockRejectedValue(new Error("fetch failed"));
    const progress = vi.fn();

    const result = await bootstrap(progress);
    expect(result.ok).toBeTruthy();
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining("Could not pre-fetch"),
        level: "warn",
      })
    );
  });

  it("includes agent action with recovery instructions", async () => {
    vi.mocked(checkGcloudInstalled).mockResolvedValue({
      ok: false,
      reason: "not found",
    });
    const result = await bootstrap();
    expectFailure(result);
    expect(result.error.agentAction).toBeTruthy();
    expect(result.error.agentAction.length).toBeGreaterThan(0);
  });
});
