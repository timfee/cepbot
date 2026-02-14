/**
 * Detects GCP infrastructure by probing the instance metadata server
 * for project and region information.
 */

import { API_BASE_URLS } from "./constants";

/**
 * Project ID and region resolved from GCP instance metadata.
 */
export interface GCPEnvironment {
  project: string;
  region: string;
}

const METADATA_HEADERS = { "Metadata-Flavor": "Google" } as const;

async function fetchMetadata(path: string): Promise<string> {
  const response = await fetch(`${API_BASE_URLS.GCP_METADATA}${path}`, {
    headers: METADATA_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Metadata request failed with status ${response.status}`);
  }

  return response.text();
}

/**
 * Detects whether we're running on GCP by querying the metadata server.
 * Returns project ID and region, or `null` if unavailable.
 */
export async function checkGCP(): Promise<GCPEnvironment | null> {
  try {
    const projectId = await fetchMetadata(
      "/computeMetadata/v1/project/project-id"
    );
    const regionPath = await fetchMetadata(
      "/computeMetadata/v1/instance/region"
    );

    if (!projectId || !regionPath) {
      return null;
    }

    const parts = regionPath.split("/");
    const region = parts[parts.length - 1];
    return { project: projectId, region };
  } catch {
    return null;
  }
}
