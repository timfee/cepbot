/**
 * Shared Zod schemas and utilities for tool input validation
 * and auth token extraction.
 */

import { z } from "zod";

/**
 * Reusable Zod schema fragments for customerId and orgUnitId
 * fields shared across tool input schemas.
 */
export const commonSchemas = {
  customerId: z
    .string()
    .optional()
    .describe("The Chrome customer ID (e.g. C012345)"),
  orgUnitId: z.string().describe("The ID of the organizational unit."),
  orgUnitIdOptional: z
    .string()
    .optional()
    .describe("The ID of the organizational unit to filter results."),
};

interface RequestInfo {
  headers?: { authorization?: string };
}

/**
 * Extracts the Bearer token from an MCP request's authorization header.
 */
export function getAuthToken(requestInfo?: RequestInfo): string | null {
  return requestInfo?.headers?.authorization
    ? requestInfo.headers.authorization.split(" ")[1]
    : null;
}

/**
 * Strips the "id:" prefix from org unit IDs passed by callers
 * who copy values from the Admin console.
 */
export function validateAndGetOrgUnitId(orgUnitId: string): string {
  if (orgUnitId.startsWith("id:")) {
    return orgUnitId.slice(3);
  }
  return orgUnitId;
}
