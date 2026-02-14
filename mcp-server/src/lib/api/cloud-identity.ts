/**
 * Cloud Identity API client — DLP rule CRUD operations and URL list
 * creation via the v1beta1 policies endpoint.
 */

import { API_BASE_URLS } from "@lib/constants";

import { googleFetch } from "./fetch";

/**
 * A Data Loss Prevention policy returned by the Cloud Identity API.
 */
export interface DlpPolicy {
  name?: string;
  setting?: {
    value?: {
      triggers?: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * A URL list policy resource returned after creation.
 */
export interface UrlListPolicy {
  name?: string;
  [key: string]: unknown;
}

/**
 * Creates a DLP rule scoped to an organizational unit. Supports
 * validate-only mode for dry-run verification before persisting.
 */
export async function createDlpRule(
  customerId: string,
  orgUnitId: string,
  ruleConfig: Record<string, unknown>,
  validateOnly?: boolean,
  accessToken?: string | null
): Promise<DlpPolicy> {
  const url = new URL(`${API_BASE_URLS.CLOUD_IDENTITY}/policies`);
  if (validateOnly) {
    url.searchParams.set("validateOnly", "true");
  }

  const body = {
    customer: `customers/${customerId}`,
    orgUnit: `orgunits/${orgUnitId}`,
    setting: { value: ruleConfig },
  };

  return googleFetch<DlpPolicy>(url.href, { accessToken, body });
}

/**
 * Permanently deletes a DLP rule by its policy resource name.
 */
export async function deleteDlpRule(
  policyName: string,
  accessToken?: string | null
): Promise<void> {
  await googleFetch<undefined>(
    `${API_BASE_URLS.CLOUD_IDENTITY}/${policyName}`,
    {
      accessToken,
      method: "DELETE",
    }
  );
}

const DLP_SETTING_FILTERS: Record<string, string> = {
  detector: 'setting.type.matches("settings/detector.*")',
  rule: 'setting.type == "settings/rule.dlp"',
} as const;

/**
 * Lists DLP policies filtered by type (rule or detector) and
 * optionally by customer ID.
 */
export async function listDlpPolicies(
  type: string,
  accessToken?: string | null,
  customerId?: string
): Promise<DlpPolicy[]> {
  const url = new URL(`${API_BASE_URLS.CLOUD_IDENTITY}/policies`);

  const parts: string[] = [];
  if (customerId) {
    parts.push(`customer == "customers/${customerId}"`);
  }
  const settingFilter = DLP_SETTING_FILTERS[type];
  if (settingFilter) {
    parts.push(settingFilter);
  }
  if (parts.length > 0) {
    url.searchParams.set("filter", parts.join(" && "));
  }

  const result = await googleFetch<{ policies?: DlpPolicy[] }>(url.href, {
    accessToken,
  });
  return result.policies ?? [];
}

/**
 * Creates a URL list resource scoped to an organizational unit.
 */
export async function createUrlList(
  customerId: string,
  orgUnitId: string,
  urlListConfig: Record<string, unknown>,
  accessToken?: string | null
): Promise<UrlListPolicy> {
  const body = {
    customer: `customers/${customerId}`,
    orgUnit: `orgunits/${orgUnitId}`,
    setting: { value: urlListConfig },
  };

  return googleFetch<UrlListPolicy>(
    `${API_BASE_URLS.CLOUD_IDENTITY}/policies`,
    {
      accessToken,
      body,
    }
  );
}
