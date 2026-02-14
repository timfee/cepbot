/**
 * Verifies Application Default Credentials, produces a fresh access
 * token, and can introspect that token's granted scopes via Google's
 * tokeninfo endpoint.
 */

import { GoogleAuth } from "google-auth-library";

interface ADCSuccess {
  ok: true;
  token: string;
}

interface ADCFailure {
  cause?: unknown;
  ok: false;
  reason: string;
}

/**
 * Discriminated union for ADC verification outcomes.
 * On success, includes the access token for downstream scope checks.
 */
export type ADCResult = ADCFailure | ADCSuccess;

/**
 * Verifies that Google Cloud Application Default Credentials (ADC)
 * are configured and can produce a valid access token.
 * Returns the token on success for use in scope verification.
 */
export async function verifyADCCredentials(): Promise<ADCResult> {
  try {
    const auth = new GoogleAuth();
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      return { ok: false, reason: "ADC produced no access token" };
    }

    return { ok: true, token: tokenResponse.token };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { cause: error, ok: false, reason: error.message };
    }
    return { cause: error, ok: false, reason: String(error) };
  }
}

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

/**
 * Result of verifying token scopes via Google's tokeninfo endpoint.
 */
export interface TokenScopeResult {
  /** Scopes actually granted on the access token. */
  granted: string[];
  missing: string[];
  ok: boolean;
  /** How the scopes were determined. */
  source: "tokeninfo" | "unavailable";
}

/**
 * Introspects an access token via Google's tokeninfo endpoint
 * to determine the actual granted scopes. Falls back gracefully
 * if the endpoint is unreachable.
 */
export async function verifyTokenScopes(
  accessToken: string,
  required: string[]
): Promise<TokenScopeResult> {
  try {
    const response = await fetch(
      `${TOKENINFO_URL}?access_token=${accessToken}`
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`tokeninfo returned ${String(response.status)}: ${body}`);
    }

    const json: unknown = await response.json();
    const scope =
      typeof json === "object" && json !== null && "scope" in json
        ? String(json.scope)
        : "";
    const granted = scope.split(" ").filter(Boolean);
    const grantedSet = new Set(granted);
    const missing = required.filter((s) => !grantedSet.has(s));

    return { granted, missing, ok: missing.length === 0, source: "tokeninfo" };
  } catch {
    // Tokeninfo unreachable — skip scope check, let API calls fail naturally
    return { granted: [], missing: [], ok: true, source: "unavailable" };
  }
}
