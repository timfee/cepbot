/**
 * Low-level GCP REST operations — service state checks, service
 * enablement, long-running operation polling, and project creation
 * via the Cloud Resource Manager API.
 */

import { setTimeout as delay } from "node:timers/promises";

import { googleFetch } from "./api/fetch";
import { API_BASE_URLS, POLLING } from "./constants";

interface ServiceState {
  state: string;
}

interface Operation {
  done?: boolean;
  name?: string;
}

interface ProjectOperation extends Operation {
  response?: { projectId: string };
}

async function pollOperation(
  operationUrl: string,
  accessToken: string
): Promise<void> {
  for (let i = 0; i < POLLING.MAX_ATTEMPTS; i += 1) {
    const op = await googleFetch<Operation>(operationUrl, { accessToken });

    if (op.done) {
      return;
    }

    await delay(POLLING.INTERVAL_MS);
  }

  throw new Error(`Operation timed out after ${POLLING.MAX_ATTEMPTS} polls`);
}

/**
 * Fetches the current enablement state of a Google API on a project.
 */
export async function getServiceState(
  projectId: string,
  api: string,
  accessToken: string
): Promise<string> {
  const url = `${API_BASE_URLS.SERVICE_USAGE}/projects/${projectId}/services/${api}`;
  const result = await googleFetch<ServiceState>(url, { accessToken });
  return result.state;
}

/**
 * Enables a Google API on a project and polls until the operation completes.
 */
export async function enableService(
  projectId: string,
  api: string,
  accessToken: string
): Promise<void> {
  const url = `${API_BASE_URLS.SERVICE_USAGE}/projects/${projectId}/services/${api}:enable`;
  const op = await googleFetch<Operation>(url, {
    accessToken,
    body: {},
    method: "POST",
  });

  if (op.name && !op.done) {
    await pollOperation(
      `${API_BASE_URLS.SERVICE_USAGE}/${op.name}`,
      accessToken
    );
  }
}

/**
 * Creates a new GCP project via the Cloud Resource Manager API.
 */
export async function createProject(
  accessToken: string,
  projectId: string,
  parent?: string
): Promise<string> {
  const body: Record<string, string> = { projectId };
  if (parent) {
    body.parent = parent;
  }

  const op = await googleFetch<ProjectOperation>(
    `${API_BASE_URLS.CLOUD_RESOURCE_MANAGER}/projects`,
    { accessToken, body, method: "POST" }
  );

  if (op.name && !op.done) {
    const finalOp = await googleFetch<ProjectOperation>(
      `${API_BASE_URLS.CLOUD_RESOURCE_MANAGER}/${op.name}`,
      { accessToken }
    );
    return finalOp.response?.projectId ?? projectId;
  }

  return op.response?.projectId ?? projectId;
}
