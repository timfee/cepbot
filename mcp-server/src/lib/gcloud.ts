/**
 * Reads the local gcloud CLI state and ADC credential file to verify
 * installation, read granted scopes, and manage the quota project.
 */

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { errorMessage } from "./constants";

interface GcloudSuccess {
  ok: true;
}

interface GcloudFailure {
  cause?: unknown;
  ok: false;
  reason: string;
}

/**
 * Discriminated union for gcloud CLI availability checks.
 */
export type GcloudResult = GcloudFailure | GcloudSuccess;

/**
 * Result of comparing granted scopes against required scopes.
 */
export interface ScopeResult {
  /** Credential type from the ADC file (e.g. "authorized_user", "service_account"). */
  credentialType: string | null;
  /** Scopes listed in the ADC file. */
  granted: string[];
  missing: string[];
  ok: boolean;
}

interface ADCCredentials {
  client_id?: string;
  client_secret?: string;
  quota_project_id?: string;
  refresh_token?: string;
  scopes?: string[];
  type?: string;
}

function adcPath(): string {
  return join(
    homedir(),
    ".config",
    "gcloud",
    "application_default_credentials.json"
  );
}

async function readADCFile(): Promise<ADCCredentials | null> {
  try {
    const content = await readFile(adcPath(), "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Checks whether the gcloud CLI is installed and reachable on PATH.
 */
export async function checkGcloudInstalled(): Promise<GcloudResult> {
  try {
    execFileSync("gcloud", ["--version"]);
    return { ok: true };
  } catch (error: unknown) {
    const reason = errorMessage(error);
    return { cause: error, ok: false, reason };
  }
}

/**
 * Reads the OAuth scopes granted in the local ADC credential file.
 */
export async function getADCScopes(): Promise<string[]> {
  const creds = await readADCFile();
  return creds?.scopes ?? [];
}

/**
 * Compares the ADC scopes against a required set and returns any missing.
 * Also returns granted scopes and credential type for diagnostic logging.
 */
export async function verifyRequiredScopes(
  required: string[]
): Promise<ScopeResult> {
  const creds = await readADCFile();
  const credentialType = creds?.type ?? null;
  const granted = creds?.scopes ?? [];
  const grantedSet = new Set(granted);
  const missing = required.filter((scope) => !grantedSet.has(scope));
  return { credentialType, granted, missing, ok: missing.length === 0 };
}

/**
 * Reads the active project from the user's gcloud CLI configuration.
 * Used as a fallback when the ADC file has no quota_project_id.
 */
export function getGcloudProject(): string | null {
  try {
    const output = execFileSync("gcloud", ["config", "get-value", "project"], {
      encoding: "utf8",
    });
    const trimmed = output.trim();
    return trimmed && trimmed !== "(unset)" ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Reads the quota project ID from the local ADC credential file.
 */
export async function getQuotaProject(): Promise<string | null> {
  const creds = await readADCFile();
  return creds?.quota_project_id ?? null;
}

/**
 * Sets the ADC quota project via the gcloud CLI.
 */
export async function setQuotaProject(projectId: string): Promise<void> {
  execFileSync("gcloud", [
    "auth",
    "application-default",
    "set-quota-project",
    projectId,
  ]);
}
