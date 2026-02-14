import { getCustomerId as fetchCustomerId } from "@lib/api/admin-sdk";
import { GoogleApiError } from "@lib/api/fetch";

interface SetupResult {
  customerId: string | null;
  error: string | null;
}

const setupPromise: Promise<SetupResult> = (async () => {
  try {
    const customer = await fetchCustomerId();
    return { customerId: customer?.id ?? null, error: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { customerId: null, error: message };
  }
})();

export async function resolveCustomerId(): Promise<string> {
  const { customerId, error } = await setupPromise;
  if (customerId) {
    return customerId;
  }

  const lines = [
    "",
    "============================================================",
    "  E2E tests require Google Cloud Application Default Credentials",
    "============================================================",
    "",
    error
      ? `  ADC error: ${error}`
      : "  Could not resolve customer ID from ADC.",
    "",
    "  To configure ADC, run:",
    "",
    "    gcloud auth application-default login \\",
    "      --scopes=openid,\\",
    "https://www.googleapis.com/auth/userinfo.email,\\",
    "https://www.googleapis.com/auth/cloud-platform,\\",
    "https://www.googleapis.com/auth/admin.directory.customer.readonly,\\",
    "https://www.googleapis.com/auth/admin.directory.orgunit.readonly,\\",
    "https://www.googleapis.com/auth/admin.reports.audit.readonly,\\",
    "https://www.googleapis.com/auth/chrome.management.policy.readonly,\\",
    "https://www.googleapis.com/auth/chrome.management.reports.readonly,\\",
    "https://www.googleapis.com/auth/chrome.management.profiles.readonly,\\",
    "",
    "  Then re-run: npm run test:e2e",
    "============================================================",
    "",
  ];

  throw new Error(lines.join("\n"));
}

export function isExpectedApiError(
  error: unknown,
  ...statuses: number[]
): boolean {
  return error instanceof GoogleApiError && statuses.includes(error.status);
}

export function stripIdPrefix(orgUnitId: string): string {
  return orgUnitId.startsWith("id:") ? orgUnitId.slice(3) : orgUnitId;
}
