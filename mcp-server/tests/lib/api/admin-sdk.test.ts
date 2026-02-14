import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lib/api/fetch", () => ({
  googleFetch: vi.fn(),
}));

const { googleFetch } = await import("@lib/api/fetch");
const { getCustomerId, listChromeActivities, listOrgUnits } =
  await import("@lib/api/admin-sdk");

describe("admin-sdk", () => {
  beforeEach(() => {
    vi.mocked(googleFetch).mockReset();
  });

  describe("getCustomerId", () => {
    it("returns customer on success", async () => {
      vi.mocked(googleFetch).mockResolvedValue({ id: "C012345" });

      const result = await getCustomerId("tok");
      expect(result).toStrictEqual({ id: "C012345" });
      expect(googleFetch).toHaveBeenCalledWith(
        "https://admin.googleapis.com/admin/directory/v1/customers/my_customer",
        { accessToken: "tok" }
      );
    });

    it("returns null on error", async () => {
      vi.mocked(googleFetch).mockRejectedValue(new Error("forbidden"));

      const result = await getCustomerId("tok");
      expect(result).toBeNull();
    });

    it("passes null accessToken for ADC fallback", async () => {
      vi.mocked(googleFetch).mockResolvedValue({ id: "C099" });

      await getCustomerId(null);
      expect(googleFetch).toHaveBeenCalledWith(expect.any(String), {
        accessToken: null,
      });
    });
  });

  describe("listChromeActivities", () => {
    it("returns activities from items", async () => {
      const items = [{ kind: "activity" }];
      vi.mocked(googleFetch).mockResolvedValue({ items });

      const result = await listChromeActivities({ userKey: "all" }, "tok");
      expect(result).toStrictEqual(items);
    });

    it("returns empty array when no items", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      const result = await listChromeActivities({ userKey: "all" }, "tok");
      expect(result).toStrictEqual([]);
    });

    it("builds URL with all query params", async () => {
      vi.mocked(googleFetch).mockResolvedValue({ items: [] });

      await listChromeActivities(
        {
          customerId: "C012345",
          endTime: "2025-01-10T00:00:00Z",
          eventName: "login",
          maxResults: 50,
          startTime: "2025-01-01T00:00:00Z",
          userKey: "user@example.com",
        },
        "tok"
      );

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      expect(calledUrl).toContain("user%40example.com");
      expect(calledUrl).toContain("customerId=C012345");
      expect(calledUrl).toContain("eventName=login");
      expect(calledUrl).toContain("startTime=");
      expect(calledUrl).toContain("endTime=");
      expect(calledUrl).toContain("maxResults=50");
    });

    it("omits optional params when not provided", async () => {
      vi.mocked(googleFetch).mockResolvedValue({ items: [] });

      await listChromeActivities({ userKey: "all" }, "tok");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      expect(calledUrl).not.toContain("customerId=");
      expect(calledUrl).not.toContain("eventName=");
    });
  });

  describe("listOrgUnits", () => {
    it("returns org units", async () => {
      const units = [{ name: "Sales", orgUnitId: "1", orgUnitPath: "/Sales" }];
      vi.mocked(googleFetch).mockResolvedValue({ organizationUnits: units });

      const result = await listOrgUnits({}, "tok");
      expect(result).toStrictEqual(units);
    });

    it("returns empty array when no org units", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      const result = await listOrgUnits({}, "tok");
      expect(result).toStrictEqual([]);
    });

    it("uses my_customer as default customerId", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await listOrgUnits({}, "tok");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      expect(calledUrl).toContain("/customer/my_customer/orgunits");
    });

    it("uses provided customerId", async () => {
      vi.mocked(googleFetch).mockResolvedValue({});

      await listOrgUnits({ customerId: "C012345" }, "tok");

      const calledUrl = vi.mocked(googleFetch).mock.calls[0][0];
      expect(calledUrl).toContain("/customer/C012345/orgunits");
    });
  });
});
