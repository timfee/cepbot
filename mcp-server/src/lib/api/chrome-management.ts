/**
 * Chrome Management API client — browser version counts and
 * customer profile listings.
 */

import { API_BASE_URLS } from "@lib/constants";

import { googleFetch } from "./fetch";

/**
 * Aggregated count of a specific Chrome browser version across devices.
 */
export interface BrowserVersion {
  count: number;
  releaseChannel?: string;
  version: string;
}

/**
 * Enrolled browser profile with device and version metadata.
 */
export interface CustomerProfile {
  annotatedAssetId?: string;
  annotatedLocation?: string;
  browserVersion?: string;
  lastActivityTime?: string;
  osPlatform?: string;
}

/**
 * Counts Chrome browser versions reported by managed devices,
 * optionally scoped to an organizational unit.
 */
export async function countBrowserVersions(
  customerId: string,
  orgUnitId?: string,
  accessToken?: string | null
): Promise<BrowserVersion[]> {
  const url = new URL(
    `${API_BASE_URLS.CHROME_MANAGEMENT}/customers/${encodeURIComponent(customerId)}/reports:countChromeVersions`
  );

  if (orgUnitId) {
    url.searchParams.set("orgUnitId", orgUnitId);
  }

  const result = await googleFetch<{
    browserVersions?: BrowserVersion[];
  }>(url.href, { accessToken });
  return result.browserVersions ?? [];
}

/**
 * Lists browser profiles enrolled under a customer.
 */
export async function listCustomerProfiles(
  customerId: string,
  accessToken?: string | null
): Promise<CustomerProfile[]> {
  const url = `${API_BASE_URLS.CHROME_MANAGEMENT}/customers/${encodeURIComponent(customerId)}/profiles`;

  const result = await googleFetch<{
    profiles?: CustomerProfile[];
  }>(url, { accessToken });
  return result.profiles ?? [];
}
