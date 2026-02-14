import {
  API_VERSIONS,
  CHROME_DLP_TRIGGERS,
  DEFAULT_REGION,
  ERROR_MESSAGES,
  errorMessage,
  GRPC_CODE,
  RETRY,
  SCOPES,
  SERVICE_NAMES,
} from "@lib/constants";
import { describe, expect, it } from "vitest";

describe("constants", () => {
  it("exports SERVICE_NAMES", () => {
    expect(SERVICE_NAMES.CHROME_MANAGEMENT).toBe(
      "chromemanagement.googleapis.com"
    );
  });

  it("exports SCOPES", () => {
    expect(SCOPES.CHROME_MANAGEMENT_POLICY).toContain("googleapis.com");
    expect(SCOPES.CLOUD_PLATFORM).toBe(
      "https://www.googleapis.com/auth/cloud-platform"
    );
  });

  it("exports API_VERSIONS", () => {
    expect(API_VERSIONS.CHROME_MANAGEMENT).toBe("v1");
  });

  it("exports RETRY config", () => {
    expect(RETRY.MAX_ATTEMPTS).toBe(7);
    expect(RETRY.FIRST_RETRY_MS).toBe(15_000);
    expect(RETRY.BASE_BACKOFF_MS).toBe(1000);
    expect(RETRY.ENABLE_RETRY_MS).toBe(1000);
  });

  it("exports GRPC_CODE", () => {
    expect(GRPC_CODE.PERMISSION_DENIED).toBe(7);
  });

  it("exports DEFAULT_REGION", () => {
    expect(DEFAULT_REGION).toBe("europe-west1");
  });

  it("exports ERROR_MESSAGES with a function for API_NOT_ENABLED", () => {
    expect(ERROR_MESSAGES.API_NOT_ENABLED("foo.api")).toBe(
      "API [foo.api] is not enabled."
    );
    expect(ERROR_MESSAGES.INSUFFICIENT_SCOPES).toContain("scopes");
    expect(ERROR_MESSAGES.NO_CREDENTIALS).toContain("credentials");
    expect(ERROR_MESSAGES.PERMISSION_DENIED).toContain("denied");
    expect(ERROR_MESSAGES.QUOTA_PROJECT_NOT_SET).toContain("quota");
  });

  it("exports CHROME_DLP_TRIGGERS", () => {
    expect(CHROME_DLP_TRIGGERS.FILE_UPLOAD).toContain("upload");
  });

  describe("errorMessage", () => {
    it("extracts message from Error instances", () => {
      expect(errorMessage(new Error("test error"))).toBe("test error");
    });

    it("converts non-Error values to string", () => {
      expect(errorMessage("string error")).toBe("string error");
      expect(errorMessage(42)).toBe("42");
      expect(errorMessage(null)).toBe("null");
      expect(errorMessage(undefined)).toBe("undefined");
    });
  });
});
