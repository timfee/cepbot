/**
 * Authenticated HTTP client for Google APIs with ADC token resolution
 * and quota project headers.
 */

import { GRPC_CODE } from "@lib/constants";
import { GoogleAuth } from "google-auth-library";

/**
 * Structured error for failed Google API responses, carrying the
 * HTTP status code and mapping 403 to the gRPC PERMISSION_DENIED code.
 */
export class GoogleApiError extends Error {
  readonly code: number;
  readonly status: number;

  constructor(status: number, body: string) {
    super(body);
    this.name = "GoogleApiError";
    this.status = status;
    this.code = status === 403 ? GRPC_CODE.PERMISSION_DENIED : status;
  }
}

let cachedAuth: GoogleAuth | undefined;

function getAuth(): GoogleAuth {
  cachedAuth ??= new GoogleAuth();
  return cachedAuth;
}

/**
 * Clears the cached GoogleAuth instance so the next API call
 * reads fresh Application Default Credentials from disk.
 * Called by retry_bootstrap after the user re-authenticates.
 */
export function resetCachedAuth(): void {
  cachedAuth = undefined;
}

interface ResolvedCredentials {
  quotaProjectId?: string;
  token: string;
}

async function resolveCredentials(
  accessToken?: string | null
): Promise<ResolvedCredentials> {
  if (accessToken) {
    return { token: accessToken };
  }

  const auth = getAuth();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (!tokenResponse.token) {
    throw new GoogleApiError(401, "Failed to obtain access token from ADC");
  }

  return {
    quotaProjectId: client.quotaProjectId ?? undefined,
    token: tokenResponse.token,
  };
}

function assertIs<T>(_: unknown): asserts _ is T {
  // Type narrowing for API response data
}

/**
 * Makes an authenticated request to a Google API, resolving credentials
 * from ADC when no explicit access token is provided.
 */
export async function googleFetch<T>(
  url: string,
  options?: {
    accessToken?: string | null;
    body?: unknown;
    method?: string;
  }
): Promise<T> {
  const { quotaProjectId, token } = await resolveCredentials(
    options?.accessToken
  );
  const method = options?.method ?? (options?.body ? "POST" : "GET");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (quotaProjectId) {
    headers["x-goog-user-project"] = quotaProjectId;
  }

  let body: string | undefined;
  if (options?.body) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, { body, headers, method });

  if (response.status === 204) {
    const empty: unknown = undefined;
    assertIs<T>(empty);
    return empty;
  }

  const text = await response.text();

  if (!response.ok) {
    throw new GoogleApiError(response.status, text);
  }

  return JSON.parse(text);
}
