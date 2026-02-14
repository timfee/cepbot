/**
 * Factory functions for creating agent-directive BootstrapError
 * objects for each bootstrap failure mode.
 */

import type { BootstrapError } from "./server-state";

import { SCOPES } from "./constants";

const ALL_SCOPES = Object.values(SCOPES).join(",");

export function gcloudMissingError(): BootstrapError {
  return {
    agentAction: [
      "Tell the user: The Google Cloud CLI (gcloud) is not installed or not in your PATH.",
      "Offer to help them install it by directing them to: https://cloud.google.com/sdk/docs/install",
      "After installation, ask them to restart their terminal and try again.",
    ].join("\n"),
    problem:
      "The gcloud CLI is not installed or not reachable. The server cannot authenticate without it.",
    type: "gcloud_missing",
  };
}

export function adcCredentialsError(reason: string): BootstrapError {
  return {
    agentAction: [
      "Tell the user their Google Cloud credentials are not configured or invalid.",
      "",
      `Raw error: ${reason}`,
      "",
      "The user MUST authenticate with ALL required scopes. Offer to run this EXACT command:",
      "",
      `  gcloud auth application-default login --scopes=${ALL_SCOPES}`,
      "",
      "IMPORTANT: The --scopes flag is required. Without it, gcloud only grants default scopes which do NOT include the Google Workspace Admin and Chrome Management scopes this server needs.",
    ].join("\n"),
    cause: reason,
    problem: `Application Default Credentials are not configured: ${reason}`,
    type: "adc_credentials",
  };
}

export function scopeMissingError(
  missing: string[],
  granted: string[]
): BootstrapError {
  const diagnostics = [
    `Scopes on token (${String(granted.length)}): ${granted.length > 0 ? granted.join(", ") : "(none)"}`,
    `Missing scopes (${String(missing.length)}): ${missing.join(", ")}`,
  ].join("\n");

  return {
    agentAction: [
      "Tell the user their credentials are missing required OAuth scopes.",
      "",
      "DIAGNOSTIC INFO (from Google tokeninfo endpoint):",
      diagnostics,
      "",
      "The user MUST re-authenticate with ALL required scopes. Offer to run this EXACT command:",
      "",
      `  gcloud auth application-default login --scopes=${ALL_SCOPES}`,
      "",
      "IMPORTANT: The --scopes flag is required. Without it, gcloud only grants default scopes which do NOT include the Google Workspace Admin and Chrome Management scopes this server needs.",
    ].join("\n"),
    problem: `Credentials are missing ${String(missing.length)} required OAuth scope(s).\n\n${diagnostics}`,
    type: "scope_missing",
  };
}

export function quotaProjectError(reason: string): BootstrapError {
  return {
    agentAction: [
      "Tell the user a GCP quota project could not be resolved or created.",
      "Offer to run this command for the user:\n\n  gcloud auth application-default set-quota-project PROJECT_ID",
      "Ask the user for their GCP project ID if they have one.",
    ].join("\n"),
    cause: reason,
    problem: `Could not resolve a quota project: ${reason}`,
    type: "quota_project",
  };
}

export function apiEnablementError(
  failedApis: string[],
  projectId: string
): BootstrapError {
  const apiList = failedApis.join(" ");
  return {
    agentAction: [
      "Tell the user that required Google APIs could not be enabled on their project.",
      `Offer to run this command for the user:\n\n  gcloud services enable ${apiList} --project=${projectId}`,
      "If permission is denied, the user may need to ask their GCP project admin to enable these APIs.",
    ].join("\n"),
    apiFailures: failedApis,
    problem: `Failed to enable required APIs on project ${projectId}: ${failedApis.join(", ")}`,
    type: "api_enablement",
  };
}
