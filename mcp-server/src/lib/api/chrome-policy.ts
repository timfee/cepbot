/**
 * Chrome Policy API client — resolves Chrome Enterprise connector
 * policy configurations for a given organizational unit.
 */

import { API_BASE_URLS } from "@lib/constants";

import { googleFetch } from "./fetch";

/**
 * Resolved policy response from the Chrome Policy API.
 */
export interface ConnectorPolicy {
  resolvedPolicies?: unknown[];
  [key: string]: unknown;
}

/**
 * Maps user-facing connector event names to their Chrome Policy API
 * schema identifiers under the EnterpriseConnectors namespace.
 */
export const ConnectorPolicyFilter: Record<string, string> = {
  ON_BULK_DATA_ENTRY: "chrome.users.EnterpriseConnectors.OnBulkDataEntry",
  ON_FILE_ATTACHED: "chrome.users.EnterpriseConnectors.OnFileAttached",
  ON_FILE_DOWNLOADED: "chrome.users.EnterpriseConnectors.OnFileDownloaded",
  ON_PRINT: "chrome.users.EnterpriseConnectors.OnPrint",
  ON_SECURITY_EVENT: "chrome.users.EnterpriseConnectors.OnSecurityEvent",
} as const;

/**
 * Wildcard schema filter that returns all connector policies in a
 * single API call.
 */
export const CONNECTOR_WILDCARD =
  "chrome.users.EnterpriseConnectors.*" as const;

/**
 * Maps Chrome Enterprise Connector policy schema IDs to their API
 * value field names within the resolved policy response.
 */
export const CONNECTOR_VALUE_KEYS: Record<string, string> = {
  "chrome.users.EnterpriseConnectors.OnBulkDataEntry":
    "onBulkDataEntryEnterpriseConnector",
  "chrome.users.EnterpriseConnectors.OnFileAttached":
    "onFileAttachedEnterpriseConnector",
  "chrome.users.EnterpriseConnectors.OnFileDownloaded":
    "onFileDownloadedEnterpriseConnector",
  "chrome.users.EnterpriseConnectors.OnPrint": "onPrintEnterpriseConnector",
  "chrome.users.EnterpriseConnectors.OnSecurityEvent":
    "onSecurityEventEnterpriseConnector",
} as const;

/**
 * Resolves the current connector policy for a specific organizational
 * unit and policy schema filter.
 */
export async function getConnectorPolicy(
  customerId: string,
  orgUnitId: string,
  policySchemaFilter: string,
  _progressCallback?: unknown,
  accessToken?: string | null
): Promise<ConnectorPolicy> {
  const url = `${API_BASE_URLS.CHROME_POLICY}/customers/${encodeURIComponent(customerId)}/policies:resolve`;
  const body = {
    policySchemaFilter,
    policyTargetKey: {
      targetResource: `orgunits/${orgUnitId}`,
    },
  };

  return googleFetch<ConnectorPolicy>(url, { accessToken, body });
}
