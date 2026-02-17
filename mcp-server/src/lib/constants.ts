/**
 * Centralized configuration — API endpoints, OAuth scopes, retry
 * parameters, and DLP trigger mappings shared across the MCP server.
 */

/**
 * Base URLs for all Google APIs used by the server.
 */
export const API_BASE_URLS = {
  ADMIN: "https://admin.googleapis.com",
  CHROME_MANAGEMENT: "https://chromemanagement.googleapis.com/v1",
  CHROME_POLICY: "https://chromepolicy.googleapis.com/v1",
  CLOUD_IDENTITY: "https://cloudidentity.googleapis.com/v1beta1",
  CLOUD_RESOURCE_MANAGER: "https://cloudresourcemanager.googleapis.com/v3",
  GCP_METADATA: "http://metadata.google.internal",
  SERVICE_USAGE: "https://serviceusage.googleapis.com/v1",
} as const;

/**
 * Google API service identifiers required by bootstrap for enablement checks.
 */
export const SERVICE_NAMES = {
  ADMIN_SDK: "admin.googleapis.com",
  CHROME_MANAGEMENT: "chromemanagement.googleapis.com",
  CHROME_POLICY: "chromepolicy.googleapis.com",
  CLOUD_IDENTITY: "cloudidentity.googleapis.com",
} as const;

/**
 * OAuth scopes required by the server's API clients.
 */
export const SCOPES = {
  ADMIN_DIRECTORY_CUSTOMER_READONLY:
    "https://www.googleapis.com/auth/admin.directory.customer.readonly",
  ADMIN_DIRECTORY_ORGUNIT_READONLY:
    "https://www.googleapis.com/auth/admin.directory.orgunit.readonly",
  ADMIN_REPORTS_AUDIT_READONLY:
    "https://www.googleapis.com/auth/admin.reports.audit.readonly",
  CHROME_MANAGEMENT_POLICY:
    "https://www.googleapis.com/auth/chrome.management.policy",
  CHROME_MANAGEMENT_PROFILES_READONLY:
    "https://www.googleapis.com/auth/chrome.management.profiles.readonly",
  CHROME_MANAGEMENT_REPORTS_READONLY:
    "https://www.googleapis.com/auth/chrome.management.reports.readonly",
  CLOUD_IDENTITY_POLICIES:
    "https://www.googleapis.com/auth/cloud-identity.policies",
  CLOUD_PLATFORM: "https://www.googleapis.com/auth/cloud-platform",
} as const;

/**
 * API version strings used in discovery and URL construction.
 */
export const API_VERSIONS = {
  ADMIN_DIRECTORY: "directory_v1",
  ADMIN_REPORTS: "reports_v1",
  CHROME_MANAGEMENT: "v1",
  CHROME_POLICY: "v1",
  CLOUD_IDENTITY: "v1beta1",
} as const;

/**
 * Exponential-backoff retry parameters for API enablement calls.
 */
export const RETRY = {
  BASE_BACKOFF_MS: 1000,
  ENABLE_RETRY_MS: 1000,
  FIRST_RETRY_MS: 15_000,
  MAX_ATTEMPTS: 7,
} as const;

/**
 * gRPC status codes used for retry decisions.
 */
export const GRPC_CODE = {
  PERMISSION_DENIED: 7,
} as const;

/**
 * Fallback region when GCP metadata is unavailable.
 */
export const DEFAULT_REGION = "europe-west1";

/**
 * Reusable error message templates for common failure modes.
 */
export const ERROR_MESSAGES = {
  API_NOT_ENABLED: (api: string) => `API [${api}] is not enabled.`,
  INSUFFICIENT_SCOPES: "Request had insufficient authentication scopes.",
  NO_CREDENTIALS: "Could not load the default credentials.",
  PERMISSION_DENIED: "Permission denied",
  QUOTA_PROJECT_NOT_SET:
    "API requires a quota project, which is not set by default",
} as const;

/**
 * Long-running operation polling parameters for GCP API calls.
 */
export const POLLING = {
  INTERVAL_MS: 2000,
  MAX_ATTEMPTS: 30,
} as const;

/**
 * APIs that must be enabled before any other service can be checked.
 */
export const PREREQUISITE_APIS = ["serviceusage.googleapis.com"] as const;

/**
 * Character sets for generating pronounceable project IDs.
 */
export const PROJECT_ID_CHARS = {
  CONSONANTS: "bcdfghjklmnpqrstvwxyz",
  VOWELS: "aeiou",
} as const;

/**
 * Chrome DLP trigger event strings keyed by semantic name.
 * Used to filter policies to Chrome-supported triggers only.
 */
export const CHROME_DLP_TRIGGERS = {
  FILE_DOWNLOAD: "google.workspace.chrome.file.v1.download",
  FILE_UPLOAD: "google.workspace.chrome.file.v1.upload",
  PRINT: "google.workspace.chrome.page.v1.print",
  URL_NAVIGATION: "google.workspace.chrome.url.v1.navigation",
  WEB_CONTENT_UPLOAD: "google.workspace.chrome.web_content.v1.upload",
} as const;

/**
 * Extracts a human-readable message from an unknown caught value.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
