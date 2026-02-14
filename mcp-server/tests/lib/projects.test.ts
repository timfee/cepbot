import { describe, expect, it, vi } from "vitest";

vi.mock("@lib/clients", () => ({
  createProject: vi.fn(),
}));

const { createProject: mockCreateProject } = await import("@lib/clients");
const { createProject, generateProjectId } = await import("@lib/projects");

describe("generateProjectId", () => {
  it("returns an ID in the format mcp-cvc-cvc", () => {
    const id = generateProjectId();
    expect(id).toMatch(
      /^mcp-[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]-[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]$/
    );
  });

  it("generates different IDs on successive calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateProjectId()));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("createProject", () => {
  it("creates a project with the given ID", async () => {
    vi.mocked(mockCreateProject).mockResolvedValue("my-proj");

    const result = await createProject("tok", "my-proj", "organizations/123");
    expect(result).toStrictEqual({ projectId: "my-proj" });
    expect(mockCreateProject).toHaveBeenCalledWith(
      "tok",
      "my-proj",
      "organizations/123"
    );
  });

  it("generates an ID when none is provided", async () => {
    vi.mocked(mockCreateProject).mockImplementation(
      async (_tok: string, id: string) => id
    );

    const result = await createProject("tok");
    expect(result.projectId).toMatch(/^mcp-[a-z]{3}-[a-z]{3}$/);
  });
});
