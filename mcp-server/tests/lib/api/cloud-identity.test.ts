import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lib/api/fetch", () => ({
  googleFetch: vi.fn(),
}));

const { googleFetch } = await import("@lib/api/fetch");
const { createDlpRule, createUrlList, deleteDlpRule, listDlpPolicies } =
  await import("@lib/api/cloud-identity");

describe("cloud-identity", () => {
  beforeEach(() => {
    vi.mocked(googleFetch).mockReset();
  });

  describe("createDlpRule", () => {
    it("creates a DLP rule", async () => {
      const policy = { name: "policies/abc" };
      vi.mocked(googleFetch).mockResolvedValue(policy);

      const result = await createDlpRule(
        "C012345",
        "ou123",
        { displayName: "test" },
        false,
        "tok"
      );

      expect(result).toStrictEqual(policy);
      expect(googleFetch).toHaveBeenCalledWith(
        "https://cloudidentity.googleapis.com/v1beta1/policies",
        {
          accessToken: "tok",
          body: {
            customer: "customers/C012345",
            orgUnit: "orgunits/ou123",
            setting: { value: { displayName: "test" } },
          },
        }
      );
    });

    it("includes validateOnly query param when true", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await createDlpRule("C012345", "ou123", {}, true, "tok");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      expect(calledUrl).toContain("validateOnly=true");
    });

    it("omits validateOnly when false", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await createDlpRule("C012345", "ou123", {}, false, "tok");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      expect(calledUrl).not.toContain("validateOnly");
    });
  });

  describe("deleteDlpRule", () => {
    it("deletes a DLP rule", async () => {
      vi.mocked(googleFetch).mockResolvedValue(undefined);

      await deleteDlpRule("policies/abc", "tok");

      expect(googleFetch).toHaveBeenCalledWith(
        "https://cloudidentity.googleapis.com/v1beta1/policies/abc",
        { accessToken: "tok", method: "DELETE" }
      );
    });
  });

  describe("listDlpPolicies", () => {
    it("returns policies", async () => {
      const policies = [{ name: "policies/abc" }];
      vi.mocked(googleFetch).mockResolvedValue({ policies });

      const result = await listDlpPolicies("rule", "tok", "C012345");
      expect(result).toStrictEqual(policies);
    });

    it("returns empty array when no policies", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      const result = await listDlpPolicies("rule", "tok");
      expect(result).toStrictEqual([]);
    });

    it("builds filter with customer and rule type", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await listDlpPolicies("rule", "tok", "C012345");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      const url = new URL(calledUrl);
      const filter = url.searchParams.get("filter");
      expect(filter).toContain('customer == "customers/C012345"');
      expect(filter).toContain('setting.type == "settings/rule.dlp"');
    });

    it("builds filter with detector type", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await listDlpPolicies("detector", "tok", "C012345");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      const url = new URL(calledUrl);
      const filter = url.searchParams.get("filter");
      expect(filter).toContain('setting.type.matches("settings/detector.*")');
    });

    it("omits customer from filter when not provided", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await listDlpPolicies("rule", "tok");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      const url = new URL(calledUrl);
      const filter = url.searchParams.get("filter") ?? "";
      expect(filter).not.toContain("customer");
      expect(filter).toContain("settings/rule.dlp");
    });

    it("omits filter for unknown type without customer", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await listDlpPolicies("unknown", "tok");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      const url = new URL(calledUrl);
      expect(url.searchParams.has("filter")).toBe(false);
    });
  });

  describe("createUrlList", () => {
    it("creates a URL list", async () => {
      const policy = { name: "policies/xyz" };
      vi.mocked(googleFetch).mockResolvedValue(policy);

      const result = await createUrlList(
        "C012345",
        "ou123",
        { display_name: "blocklist", urls: ["example.com"] },
        "tok"
      );

      expect(result).toStrictEqual(policy);
      expect(googleFetch).toHaveBeenCalledWith(
        "https://cloudidentity.googleapis.com/v1beta1/policies",
        {
          accessToken: "tok",
          body: {
            customer: "customers/C012345",
            orgUnit: "orgunits/ou123",
            setting: {
              value: { display_name: "blocklist", urls: ["example.com"] },
            },
          },
        }
      );
    });
  });
});
