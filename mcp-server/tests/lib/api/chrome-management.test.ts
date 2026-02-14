import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lib/api/fetch", () => ({
  googleFetch: vi.fn(),
}));

const { googleFetch } = await import("@lib/api/fetch");
const { countBrowserVersions, listCustomerProfiles } =
  await import("@lib/api/chrome-management");

describe("chrome-management", () => {
  beforeEach(() => {
    vi.mocked(googleFetch).mockReset();
  });

  describe("countBrowserVersions", () => {
    it("returns browser versions", async () => {
      const versions = [{ count: 10, version: "120.0" }];
      vi.mocked(googleFetch).mockResolvedValue({ browserVersions: versions });

      const result = await countBrowserVersions("C012345", undefined, "tok");
      expect(result).toStrictEqual(versions);
    });

    it("returns empty array when no versions", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      const result = await countBrowserVersions("C012345", undefined, "tok");
      expect(result).toStrictEqual([]);
    });

    it("includes orgUnitId in URL when provided", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await countBrowserVersions("C012345", "ou123", "tok");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      expect(calledUrl).toContain("orgUnitId=ou123");
    });

    it("omits orgUnitId when not provided", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await countBrowserVersions("C012345", undefined, "tok");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      expect(calledUrl).not.toContain("orgUnitId");
    });
  });

  describe("listCustomerProfiles", () => {
    it("returns customer profiles", async () => {
      const profiles = [{ browserVersion: "120.0" }];
      vi.mocked(googleFetch).mockResolvedValue({ profiles });

      const result = await listCustomerProfiles("C012345", "tok");
      expect(result).toStrictEqual(profiles);
    });

    it("returns empty array when no profiles", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      const result = await listCustomerProfiles("C012345", "tok");
      expect(result).toStrictEqual([]);
    });

    it("builds correct URL", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await listCustomerProfiles("C012345", "tok");

      expect(googleFetch).toHaveBeenCalledWith(
        "https://chromemanagement.googleapis.com/v1/customers/C012345/profiles",
        { accessToken: "tok" }
      );
    });
  });
});
