import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn().mockReturnValue("/home/user"),
}));

const { execFileSync } = await import("node:child_process");
const { existsSync } = await import("node:fs");
const { readFile, writeFile } = await import("node:fs/promises");
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
    vi.mocked(writeFile).mockReset().mockResolvedValue(undefined);
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
        { encoding: "utf8", shell: true }
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

    it("returns null when output is not a valid GCP project ID", () => {
      vi.mocked(execFileSync).mockReturnValue("python.exe : (unset)\n");
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

    it("returns null when quota_project_id is not a valid GCP project ID", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ quota_project_id: "python.exe : (unset)" })
      );
      const project = await getQuotaProject();
      expect(project).toBeNull();
    });
  });

  describe("adcPath (Windows)", () => {
    const originalPlatform = process.platform;
    const savedAppdata = process.env.APPDATA;

    afterEach(() => {
      Object.defineProperty(process, "platform", { value: originalPlatform });
      if (savedAppdata === undefined) {
        delete process.env.APPDATA;
      } else {
        process.env.APPDATA = savedAppdata;
      }
    });

    it("uses APPDATA env var on win32", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env.APPDATA = "/fake/appdata";
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ quota_project_id: "my-test-proj" })
      );

      await getQuotaProject();

      expect(readFile).toHaveBeenCalledWith(
        expect.stringContaining(join("/fake/appdata", "gcloud")),
        "utf8"
      );
    });

    it("falls back to homedir when APPDATA is not set on win32", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      delete process.env.APPDATA;
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({}));

      await getQuotaProject();

      expect(readFile).toHaveBeenCalledWith(
        expect.stringContaining("AppData"),
        "utf8"
      );
    });
  });

  describe("checkGcloudInstalled (Windows fallback)", () => {
    const originalPlatform = process.platform;
    const savedPath = process.env.PATH;
    const savedLocalAppData = process.env.LOCALAPPDATA;
    const savedProgramFiles = process.env.ProgramFiles;
    const savedProgramFilesX86 = process.env["ProgramFiles(x86)"];
    const savedProgramW6432 = process.env.PROGRAMW6432;

    afterEach(() => {
      Object.defineProperty(process, "platform", { value: originalPlatform });
      if (savedPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = savedPath;
      }
      if (savedLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA;
      } else {
        process.env.LOCALAPPDATA = savedLocalAppData;
      }
      if (savedProgramFiles === undefined) {
        delete process.env.ProgramFiles;
      } else {
        process.env.ProgramFiles = savedProgramFiles;
      }
      if (savedProgramFilesX86 === undefined) {
        delete process.env["ProgramFiles(x86)"];
      } else {
        process.env["ProgramFiles(x86)"] = savedProgramFilesX86;
      }
      if (savedProgramW6432 === undefined) {
        delete process.env.PROGRAMW6432;
      } else {
        process.env.PROGRAMW6432 = savedProgramW6432;
      }
      vi.mocked(existsSync).mockReset().mockReturnValue(false);
    });

    it("finds gcloud in LOCALAPPDATA and succeeds on retry", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env.LOCALAPPDATA = "/fake/local";
      delete process.env.ProgramFiles;
      delete process.env["ProgramFiles(x86)"];
      delete process.env.PROGRAMW6432;

      let callCount = 0;
      vi.mocked(execFileSync).mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) throw new Error("not on PATH");
        return "ok";
      });
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await checkGcloudInstalled();
      expect(result).toStrictEqual({ ok: true });
      expect(process.env.PATH).toContain(`${sep}fake${sep}local`);
    });

    it("falls through when gcloud found but retry also fails", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env.LOCALAPPDATA = "/fake/local";
      delete process.env.ProgramFiles;
      delete process.env["ProgramFiles(x86)"];
      delete process.env.PROGRAMW6432;

      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error("still broken");
      });
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await checkGcloudInstalled();
      expect(result).toMatchObject({ ok: false, reason: "still broken" });
    });

    it("falls through when no well-known location has gcloud.cmd", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env.LOCALAPPDATA = "/fake/local";
      delete process.env.ProgramFiles;
      delete process.env["ProgramFiles(x86)"];
      delete process.env.PROGRAMW6432;

      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error("not found");
      });
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await checkGcloudInstalled();
      expect(result).toMatchObject({ ok: false, reason: "not found" });
    });

    it("prepends to PATH even when PATH is initially undefined", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env.LOCALAPPDATA = "/fake/local";
      delete process.env.ProgramFiles;
      delete process.env["ProgramFiles(x86)"];
      delete process.env.PROGRAMW6432;
      delete process.env.PATH;

      let callCount = 0;
      vi.mocked(execFileSync).mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) throw new Error("not on PATH");
        return "ok";
      });
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await checkGcloudInstalled();
      expect(result).toStrictEqual({ ok: true });
      expect(process.env.PATH).toContain(`${sep}fake${sep}local`);
    });

    it("skips undefined env var bases without checking existsSync", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      delete process.env.LOCALAPPDATA;
      delete process.env.ProgramFiles;
      delete process.env["ProgramFiles(x86)"];
      delete process.env.PROGRAMW6432;

      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error("not found");
      });

      const result = await checkGcloudInstalled();
      expect(result).toMatchObject({ ok: false });
      expect(existsSync).not.toHaveBeenCalled();
    });
  });

  describe("setQuotaProject", () => {
    it("calls gcloud CLI and verifies the file was updated", async () => {
      mockExecFileSuccess();
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ quota_project_id: "my-project" })
      );

      await setQuotaProject("my-project");

      expect(execFileSync).toHaveBeenCalledWith(
        "gcloud",
        ["auth", "application-default", "set-quota-project", "my-project"],
        { shell: true }
      );
    });

    it("falls back to direct file write when gcloud CLI fails", async () => {
      mockExecFileFailure("gcloud not found");

      let readCount = 0;
      vi.mocked(readFile).mockImplementation(async () => {
        readCount += 1;
        if (readCount === 1) {
          return JSON.stringify({ type: "authorized_user", client_id: "xxx" });
        }
        return JSON.stringify({
          type: "authorized_user",
          client_id: "xxx",
          quota_project_id: "my-project",
        });
      });

      await setQuotaProject("my-project");

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("application_default_credentials.json"),
        expect.stringContaining('"quota_project_id": "my-project"'),
        "utf8"
      );
    });

    it("throws when neither gcloud CLI nor direct write succeeds", async () => {
      mockExecFileFailure("gcloud not found");

      vi.mocked(readFile)
        .mockResolvedValueOnce(JSON.stringify({ type: "authorized_user" }))
        .mockResolvedValueOnce(JSON.stringify({ type: "authorized_user" }));

      await expect(setQuotaProject("my-project")).rejects.toThrow(
        "Failed to persist quota project"
      );
    });

    it("preserves gcloud CLI error as cause when verification fails", async () => {
      mockExecFileFailure("gcloud not found");

      vi.mocked(readFile)
        .mockResolvedValueOnce(JSON.stringify({ type: "authorized_user" }))
        .mockResolvedValueOnce(JSON.stringify({ type: "authorized_user" }));

      try {
        await setQuotaProject("my-project");
        expect.unreachable("should have thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        const err = error as Error;
        expect(err.cause).toBeInstanceOf(Error);
        expect((err.cause as Error).message).toBe("gcloud not found");
      }
    });

    it("has no cause when gcloud CLI succeeds but verification fails", async () => {
      mockExecFileSuccess();
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ type: "authorized_user" })
      );

      try {
        await setQuotaProject("my-project");
        expect.unreachable("should have thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).cause).toBeUndefined();
      }
    });
  });
});
