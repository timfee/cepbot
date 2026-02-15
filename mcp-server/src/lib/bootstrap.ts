/**
 * Server initialization — verifies gcloud, ADC, scopes, resolves a
 * quota project, enables APIs, and pre-fetches the customer ID.
 */

import type { ProgressCallback } from "./apis";
import type { GCPEnvironment } from "./gcp";
import type { BootstrapError } from "./server-state";

import {
  adcCredentialsError,
  apiEnablementError,
  gcloudMissingError,
  quotaProjectError,
  scopeMissingError,
} from "./agent-errors";
import { getCustomerId } from "./api/admin-sdk";
import { setFallbackQuotaProject } from "./api/fetch";
import { ensureApisEnabled } from "./apis";
import { verifyADCCredentials, verifyTokenScopes } from "./auth";
import { errorMessage, SERVICE_NAMES, SCOPES } from "./constants";
import {
  checkGcloudInstalled,
  getGcloudProject,
  getQuotaProject,
  setQuotaProject,
} from "./gcloud";
import { checkGCP } from "./gcp";
import { createProject } from "./projects";

interface BootstrapSuccess {
  customerId?: string;
  ok: true;
  projectId: string;
  region: string;
}

interface BootstrapFailure {
  error: BootstrapError;
  ok: false;
}

type QuotaProjectResult =
  | { ok: false; reason: string }
  | { ok: true; projectId: string; region: string };

/**
 * Discriminated union for bootstrap outcomes.
 */
export type BootstrapResult = BootstrapFailure | BootstrapSuccess;

const REQUIRED_SCOPES = Object.values(SCOPES);
const REQUIRED_APIS = Object.values(SERVICE_NAMES);
const NOOP_PROGRESS: ProgressCallback = () => undefined;

/**
 * Detects the GCP environment and resolves a quota project ID.
 * Creates a new project if none is found.
 */
async function resolveQuotaProject(
  gcpEnv: GCPEnvironment | null,
  progress?: ProgressCallback
): Promise<QuotaProjectResult> {
  const region = gcpEnv?.region ?? "us-central1";
  let projectId = gcpEnv?.project ?? (await getQuotaProject());

  if (!projectId) {
    progress?.({
      data: "No quota project in ADC. Checking gcloud config...",
      level: "info",
    });
    projectId = getGcloudProject();

    if (projectId) {
      progress?.({
        data: `Using gcloud config project: ${projectId}`,
        level: "info",
      });
      try {
        await setQuotaProject(projectId);
      } catch {
        progress?.({
          data: "Could not persist quota project to ADC. Continuing anyway.",
          level: "warn",
        });
      }
    }
  }

  if (!projectId) {
    progress?.({
      data: "No quota project found anywhere. Creating one...",
      level: "info",
    });
    try {
      const result = await createProject("");
      ({ projectId } = result);
      await setQuotaProject(projectId);
      progress?.({
        data: `Created and set quota project: ${projectId}`,
        level: "info",
      });
    } catch (error: unknown) {
      const message = errorMessage(error);
      return {
        ok: false,
        reason: `Failed to create quota project: ${message}`,
      };
    }
  }

  return { ok: true, projectId, region };
}

/**
 * Pre-fetches the customer ID. Non-fatal — warns on failure.
 */
async function prefetchCustomerId(
  progress?: ProgressCallback
): Promise<string | undefined> {
  progress?.({ data: "Pre-fetching customer ID...", level: "info" });
  try {
    const customer = await getCustomerId();
    if (customer?.id) {
      progress?.({
        data: `Customer ID: ${customer.id}`,
        level: "info",
      });
      return customer.id;
    }
  } catch {
    progress?.({
      data: "Could not pre-fetch customer ID. Tools will resolve it on demand.",
      level: "warn",
    });
  }
  return undefined;
}

/**
 * Runs the full server initialization sequence. Returns a success result
 * with the resolved project and optional customer ID, or a failure with
 * an agent-directive BootstrapError.
 */
export async function bootstrap(
  progress?: ProgressCallback
): Promise<BootstrapResult> {
  const log = progress ?? NOOP_PROGRESS;
  return runBootstrap(log);
}

async function runBootstrap(log: ProgressCallback): Promise<BootstrapResult> {
  log({ data: "Checking gcloud installation...", level: "info" });
  const gcloudCheck = await checkGcloudInstalled();
  if (!gcloudCheck.ok) {
    log({ data: `gcloud check failed: ${gcloudCheck.reason}`, level: "error" });
    return { error: gcloudMissingError(), ok: false };
  }
  log({ data: "gcloud CLI found.", level: "info" });

  log({ data: "Verifying ADC credentials...", level: "info" });
  const adcResult = await verifyADCCredentials();
  if (!adcResult.ok) {
    log({
      data: `ADC verification failed: ${adcResult.reason}`,
      level: "error",
    });
    return { error: adcCredentialsError(adcResult.reason), ok: false };
  }
  log({
    data: "ADC credentials valid. Checking token scopes...",
    level: "info",
  });

  const scopeResult = await verifyTokenScopes(adcResult.token, REQUIRED_SCOPES);
  const grantedList =
    scopeResult.granted.length > 0 ? scopeResult.granted.join(", ") : "(none)";
  log({
    data: `Scope check source: ${scopeResult.source}`,
    level: "info",
  });
  log({
    data: `Token scopes (${String(scopeResult.granted.length)}): ${grantedList}`,
    level: scopeResult.granted.length > 0 ? "info" : "warn",
  });
  if (!scopeResult.ok) {
    log({
      data: `Missing scopes (${String(scopeResult.missing.length)}): ${scopeResult.missing.join(", ")}`,
      level: "error",
    });
    return {
      error: scopeMissingError(scopeResult.missing, scopeResult.granted),
      ok: false,
    };
  }

  log({ data: "Detecting environment...", level: "info" });
  const gcpEnv = await checkGCP();
  log({
    data: gcpEnv
      ? `GCP environment detected: project=${gcpEnv.project}, region=${gcpEnv.region}`
      : "Not running on GCP (metadata server unreachable).",
    level: "info",
  });

  log({ data: "Resolving quota project...", level: "info" });
  const quotaResult = await resolveQuotaProject(gcpEnv, log);
  if (!quotaResult.ok) {
    log({
      data: `Quota project resolution failed: ${quotaResult.reason}`,
      level: "error",
    });
    return { error: quotaProjectError(quotaResult.reason), ok: false };
  }
  log({
    data: `Quota project resolved: ${quotaResult.projectId} (region: ${quotaResult.region})`,
    level: "info",
  });

  setFallbackQuotaProject(quotaResult.projectId);

  log({
    data: `Enabling required APIs on ${quotaResult.projectId}: ${REQUIRED_APIS.join(", ")}`,
    level: "info",
  });
  const failedApis = await ensureApisEnabled(
    quotaResult.projectId,
    REQUIRED_APIS,
    "",
    log
  );

  if (failedApis.length > 0) {
    log({
      data: `API enablement failed for: ${failedApis.join(", ")}`,
      level: "error",
    });
    return {
      error: apiEnablementError(failedApis, quotaResult.projectId),
      ok: false,
    };
  }

  const customerId = await prefetchCustomerId(log);

  return {
    customerId,
    ok: true,
    projectId: quotaResult.projectId,
    region: quotaResult.region,
  };
}
