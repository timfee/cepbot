/**
 * Reads the local gcloud CLI state and ADC credential file to verify
 * installation, read granted scopes, and manage the quota project.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
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

/**
 * On Windows gcloud is a .cmd wrapper, and execFileSync cannot launch
 * .cmd files without a shell.  Pass { shell: true } so cmd.exe resolves it.
 */
const SHELL_OPTS = { shell: true } as const;

/**
 * Returns the platform-correct path to the ADC credentials file.
 *
 * Windows: %APPDATA%\gcloud\application_default_credentials.json
 * Linux/macOS: ~/.config/gcloud/application_default_credentials.json
 *
 * Matches the resolution order used by google-auth-library and the
 * gcloud CLI itself (see AIP-4110).
 */
function adcPath(): string {
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "gcloud",
      "application_default_credentials.json"
    );
  }
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
 * Well-known Google Cloud SDK install locations on Windows.  Checked as a
 * fallback when gcloud is not found on PATH — common after a fresh winget
 * install where the parent shell's PATH hasn't propagated to child
 * processes.
 */
function findGcloudOnWindows(): string | null {
  const bases = [
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.PROGRAMW6432,
  ];

  for (const base of bases) {
    if (!base) continue;
    const binDir = join(base, "Google", "Cloud SDK", "google-cloud-sdk", "bin");
    if (existsSync(join(binDir, "gcloud.cmd"))) {
      return binDir;
    }
  }

  return null;
}

/**
 * Checks whether the gcloud CLI is installed and reachable on PATH.
 * On Windows, falls back to well-known install locations if PATH lookup fails.
 */
export async function checkGcloudInstalled(): Promise<GcloudResult> {
  try {
    execFileSync("gcloud", ["--version"], SHELL_OPTS);
    return { ok: true };
  } catch (error: unknown) {
    // On Windows, gcloud may be installed but not on the inherited PATH
    // (e.g. fresh winget install where the shell environment wasn't
    // refreshed before launching Gemini CLI).  Check well-known install
    // locations and prepend to PATH if found.
    if (process.platform === "win32") {
      const gcloudDir = findGcloudOnWindows();
      if (gcloudDir) {
        process.env.PATH = `${gcloudDir};${process.env.PATH ?? ""}`;
        try {
          execFileSync("gcloud", ["--version"], SHELL_OPTS);
          return { ok: true };
        } catch {
          // Fall through to original error
        }
      }
    }

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
      ...SHELL_OPTS,
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
 * Writes quota_project_id directly into the ADC JSON file.
 * Used as a fallback when the gcloud CLI command fails.
 */
async function patchADCQuotaProject(projectId: string): Promise<void> {
  const filePath = adcPath();
  const content = await readFile(filePath, "utf8");
  const json: Record<string, unknown> = JSON.parse(content);
  json.quota_project_id = projectId;
  await writeFile(filePath, JSON.stringify(json, null, 2), "utf8");
}

/**
 * Sets the ADC quota project.  Tries the gcloud CLI first, then falls
 * back to writing the ADC JSON file directly.  Verifies the write by
 * re-reading the file — throws if neither approach succeeds.
 */
export async function setQuotaProject(projectId: string): Promise<void> {
  // Try gcloud CLI first (canonical approach).
  try {
    execFileSync(
      "gcloud",
      ["auth", "application-default", "set-quota-project", projectId],
      SHELL_OPTS
    );
  } catch {
    // gcloud CLI failed — fall back to direct file write.
    await patchADCQuotaProject(projectId);
  }

  // Verify the value actually landed in the file.
  const persisted = await getQuotaProject();
  if (persisted !== projectId) {
    const actual = persisted ?? "(none)";
    throw new Error(
      `Failed to persist quota project to ADC file. Expected "${projectId}", got "${actual}".`
    );
  }
}
