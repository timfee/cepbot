import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn().mockReturnValue("/home/user"),
}));

const { execFileSync } = await import("node:child_process");
const { readFile } = await import("node:fs/promises");
const {
  checkGcloudInstalled,
  getADCScopes,
  getGcloudProject,
  getQuotaProject,
  setQuotaProject,
  verifyRequiredScopes,
} = await import("@lib/gcloud");

describe("gcloud", () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
    vi.mocked(readFile).mockReset();
  });

  function mockExecFileSuccess(): void {
    vi.mocked(execFileSync).mockReturnValue("ok");
  }

  function mockExecFileFailure(message: string): void {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error(message);
    });
  }

  describe("checkGcloudInstalled", () => {
    it("returns ok when gcloud is available", async () => {
      mockExecFileSuccess();
      const result = await checkGcloudInstalled();
      expect(result).toStrictEqual({ ok: true });
    });

    it("returns failure when gcloud is not found", async () => {
      mockExecFileFailure("command not found");
      const result = await checkGcloudInstalled();
      expect(result).toMatchObject({
        cause: expect.any(Error),
        ok: false,
        reason: expect.stringContaining("command not found"),
      });
    });

    it("handles non-Error throws", async () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw "string error";
      });
      const result = await checkGcloudInstalled();
      expect(result).toMatchObject({
        ok: false,
        reason: "string error",
      });
    });
  });

  describe("getADCScopes", () => {
    it("returns scopes from ADC file", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ scopes: ["scope1", "scope2"] })
      );
      const scopes = await getADCScopes();
      expect(scopes).toStrictEqual(["scope1", "scope2"]);
    });

    it("returns empty array when file not found", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
      const scopes = await getADCScopes();
      expect(scopes).toStrictEqual([]);
    });

    it("returns empty array when no scopes in file", async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({}));
      const scopes = await getADCScopes();
      expect(scopes).toStrictEqual([]);
    });
  });

  describe("verifyRequiredScopes", () => {
    it("returns ok when all scopes present", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ scopes: ["a", "b"], type: "authorized_user" })
      );
      const result = await verifyRequiredScopes(["a", "b"]);
      expect(result).toStrictEqual({
        credentialType: "authorized_user",
        granted: ["a", "b"],
        missing: [],
        ok: true,
      });
    });

    it("returns missing scopes", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ scopes: ["a"], type: "authorized_user" })
      );
      const result = await verifyRequiredScopes(["a", "b"]);
      expect(result).toStrictEqual({
        credentialType: "authorized_user",
        granted: ["a"],
        missing: ["b"],
        ok: false,
      });
    });

    it("returns all missing when ADC file has no scopes field", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ type: "authorized_user" })
      );
      const result = await verifyRequiredScopes(["a", "b"]);
      expect(result).toStrictEqual({
        credentialType: "authorized_user",
        granted: [],
        missing: ["a", "b"],
        ok: false,
      });
    });

    it("returns null credential type when ADC file is missing", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
      const result = await verifyRequiredScopes(["a"]);
      expect(result).toStrictEqual({
        credentialType: null,
        granted: [],
        missing: ["a"],
        ok: false,
      });
    });
  });

  describe("getGcloudProject", () => {
    it("returns the active gcloud config project", () => {
      vi.mocked(execFileSync).mockReturnValue("  my-gcp-project\n");
      const project = getGcloudProject();
      expect(project).toBe("my-gcp-project");
      expect(execFileSync).toHaveBeenCalledWith(
        "gcloud",
        ["config", "get-value", "project"],
        { encoding: "utf8" }
      );
    });

    it("returns null when project is (unset)", () => {
      vi.mocked(execFileSync).mockReturnValue("(unset)\n");
      expect(getGcloudProject()).toBeNull();
    });

    it("returns null when output is empty", () => {
      vi.mocked(execFileSync).mockReturnValue("  \n");
      expect(getGcloudProject()).toBeNull();
    });

    it("returns null when gcloud fails", () => {
      mockExecFileFailure("command not found");
      expect(getGcloudProject()).toBeNull();
    });
  });

  describe("getQuotaProject", () => {
    it("returns quota project from ADC file", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ quota_project_id: "my-project" })
      );
      const project = await getQuotaProject();
      expect(project).toBe("my-project");
    });

    it("returns null when no quota project", async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({}));
      const project = await getQuotaProject();
      expect(project).toBeNull();
    });

    it("returns null when file not found", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
      const project = await getQuotaProject();
      expect(project).toBeNull();
    });
  });

  describe("setQuotaProject", () => {
    it("calls gcloud to set quota project", async () => {
      mockExecFileSuccess();
      await setQuotaProject("my-project");
      expect(execFileSync).toHaveBeenCalledWith("gcloud", [
        "auth",
        "application-default",
        "set-quota-project",
        "my-project",
      ]);
    });
  });
});
