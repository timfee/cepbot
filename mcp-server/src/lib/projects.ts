/**
 * Creates GCP projects as a fallback when no existing quota project
 * is available. Generates pronounceable project IDs.
 */

import { createProject as createGcpProject } from "./clients";
import { PROJECT_ID_CHARS } from "./constants";

function randomChar(source: string): string {
  return source.charAt(Math.floor(Math.random() * source.length));
}

function generateCVC(): string {
  return `${randomChar(PROJECT_ID_CHARS.CONSONANTS)}${randomChar(PROJECT_ID_CHARS.VOWELS)}${randomChar(PROJECT_ID_CHARS.CONSONANTS)}`;
}

/**
 * Generates a GCP-compliant project ID in the format `mcp-cvc-cvc`.
 */
export function generateProjectId(): string {
  return `mcp-${generateCVC()}-${generateCVC()}`;
}

/**
 * Creates a new GCP project. If `projectId` is omitted, one is generated.
 * Intended as a fallback when no valid quota project is available.
 */
export async function createProject(
  accessToken: string,
  projectId?: string,
  parent?: string
): Promise<{ projectId: string }> {
  const id = projectId ?? generateProjectId();
  const createdId = await createGcpProject(accessToken, id, parent);
  return { projectId: createdId };
}
