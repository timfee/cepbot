/**
 * Admin SDK client — retrieves customer info, Chrome activity logs,
 * and organizational unit listings.
 */

import { API_BASE_URLS } from "@lib/constants";

import { googleFetch } from "./fetch";

/**
 * Workspace customer record with the unique identifier.
 */
export interface Customer {
  id: string;
  kind?: string;
}

/**
 * Single Chrome browser activity event from the Reports API.
 */
export interface ChromeActivity {
  actor?: { email?: string };
  events?: unknown[];
  id?: { time?: string };
  kind?: string;
}

/**
 * Organizational unit within a Workspace customer domain.
 */
export interface OrgUnit {
  name: string;
  orgUnitId: string;
  orgUnitPath: string;
  parentOrgUnitId?: string;
}

/**
 * Query parameters for the Chrome activity log endpoint.
 */
export interface ListActivitiesParams {
  customerId?: string;
  endTime?: string;
  eventName?: string;
  maxResults?: number;
  startTime?: string;
  userKey: string;
}

/**
 * Fetches the customer record for the authenticated domain.
 * Returns null when the caller lacks admin privileges.
 */
export async function getCustomerId(
  accessToken?: string | null
): Promise<Customer | null> {
  try {
    const result = await googleFetch<Customer>(
      `${API_BASE_URLS.ADMIN}/admin/directory/v1/customers/my_customer`,
      { accessToken }
    );
    return result;
  } catch {
    return null;
  }
}

/**
 * Lists Chrome browser activity events, optionally filtered by
 * customer, user, event name, and time range.
 */
export async function listChromeActivities(
  params: ListActivitiesParams,
  accessToken?: string | null
): Promise<ChromeActivity[]> {
  const url = new URL(
    `${API_BASE_URLS.ADMIN}/admin/reports/v1/activity/users/${encodeURIComponent(params.userKey)}/applications/chrome`
  );

  if (params.customerId) {
    url.searchParams.set("customerId", params.customerId);
  }
  if (params.eventName) {
    url.searchParams.set("eventName", params.eventName);
  }
  if (params.startTime) {
    url.searchParams.set("startTime", params.startTime);
  }
  if (params.endTime) {
    url.searchParams.set("endTime", params.endTime);
  }
  if (params.maxResults) {
    url.searchParams.set("maxResults", String(params.maxResults));
  }

  const result = await googleFetch<{ items?: ChromeActivity[] }>(url.href, {
    accessToken,
  });
  return result.items ?? [];
}

/**
 * Lists all organizational units for a customer, defaulting to
 * "my_customer" when no explicit ID is provided.
 */
export async function listOrgUnits(
  params: { customerId?: string },
  accessToken?: string | null
): Promise<OrgUnit[]> {
  const customerId = params.customerId ?? "my_customer";
  const url = `${API_BASE_URLS.ADMIN}/admin/directory/v1/customer/${encodeURIComponent(customerId)}/orgunits?type=all`;

  const result = await googleFetch<{ organizationUnits?: OrgUnit[] }>(url, {
    accessToken,
  });
  return result.organizationUnits ?? [];
}
