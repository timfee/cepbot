import {
  commonSchemas,
  getAuthToken,
  validateAndGetOrgUnitId,
} from "@tools/schemas";
import { describe, expect, it } from "vitest";

describe("commonSchemas", () => {
  it("defines customerId as optional string", () => {
    expect(commonSchemas.customerId.safeParse("C012345").success).toBeTruthy();
    expect(commonSchemas.customerId.safeParse(undefined).success).toBeTruthy();
  });

  it("defines orgUnitId as required string", () => {
    expect(commonSchemas.orgUnitId.safeParse("ou123").success).toBeTruthy();
    expect(commonSchemas.orgUnitId.safeParse(undefined).success).toBeFalsy();
  });

  it("defines orgUnitIdOptional as optional string", () => {
    expect(
      commonSchemas.orgUnitIdOptional.safeParse("ou123").success
    ).toBeTruthy();
    expect(
      commonSchemas.orgUnitIdOptional.safeParse(undefined).success
    ).toBeTruthy();
  });
});

describe("getAuthToken", () => {
  it("extracts Bearer token from authorization header", () => {
    const token = getAuthToken({
      headers: { authorization: "Bearer my-token" },
    });
    expect(token).toBe("my-token");
  });

  it("returns null when no authorization header", () => {
    expect(getAuthToken({ headers: {} })).toBeNull();
    expect(getAuthToken({})).toBeNull();
    expect(getAuthToken()).toBeNull();
  });
});

describe("validateAndGetOrgUnitId", () => {
  it("strips id: prefix", () => {
    expect(validateAndGetOrgUnitId("id:12345")).toBe("12345");
  });

  it("returns unchanged when no prefix", () => {
    expect(validateAndGetOrgUnitId("12345")).toBe("12345");
  });

  it("handles empty id: prefix", () => {
    expect(validateAndGetOrgUnitId("id:")).toBe("");
  });
});
