/**
 * API enablement with exponential-backoff retry on permission
 * propagation delays after newly created projects.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { setTimeout as delay } from "node:timers/promises";

import { enableService, getServiceState } from "./clients";
import { errorMessage, GRPC_CODE, PREREQUISITE_APIS, RETRY } from "./constants";

/**
 * Structured log message emitted during long-running operations.
 */
export interface ProgressMessage {
  data: string;
  level: "error" | "info" | "warn";
}

/**
 * Callback for receiving progress updates during bootstrap and API enablement.
 */
export type ProgressCallback = (message: ProgressMessage) => void;

/**
 * Creates a ProgressCallback that writes to stderr with a tagged prefix.
 * Use this for pre-connection logging (before server.connect()).
 */
export function createProgressLogger(tag: string): ProgressCallback {
  return (msg) => {
    console.error(`[${tag}] [${msg.level}] ${msg.data}`);
  };
}

const SYSLOG_LEVEL = {
  error: "error",
  info: "info",
  warn: "warning",
} as const;

/**
 * Creates a ProgressCallback that sends structured log messages over
 * the MCP logging channel. Use this for post-connection logging.
 */
export function createMcpLogger(
  server: McpServer,
  logger: string
): ProgressCallback {
  return (msg) => {
    server.sendLoggingMessage({
      data: msg.data,
      level: SYSLOG_LEVEL[msg.level],
      logger,
    });
  };
}

function hasGrpcCode(error: unknown): error is { code: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as Record<string, unknown>).code === "number"
  );
}

/**
 * Retries `fn` with exponential backoff on gRPC PERMISSION_DENIED.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  description: string,
  progress?: ProgressCallback
): Promise<T> {
  let retries = 0;

  while (true) {
    try {
      return await fn();
    } catch (error: unknown) {
      const retryable =
        hasGrpcCode(error) &&
        error.code === GRPC_CODE.PERMISSION_DENIED &&
        retries < RETRY.MAX_ATTEMPTS;

      if (!retryable) {
        throw error;
      }

      retries += 1;
      const backoff =
        retries === 1
          ? RETRY.FIRST_RETRY_MS
          : RETRY.BASE_BACKOFF_MS * 2 ** (retries - 2);

      progress?.({
        data: `"${description}" got PERMISSION_DENIED, retrying in ${backoff / 1000}s (${retries}/${RETRY.MAX_ATTEMPTS})`,
        level: "warn",
      });

      await delay(backoff);
    }
  }
}

async function checkAndEnableApi(
  projectId: string,
  api: string,
  accessToken: string,
  progress?: ProgressCallback
): Promise<void> {
  const state = await callWithRetry(
    async () => getServiceState(projectId, api, accessToken),
    `getService ${api}`,
    progress
  );

  if (state === "ENABLED") {
    return;
  }

  progress?.({
    data: `API [${api}] is not enabled. Enabling...`,
    level: "info",
  });

  await callWithRetry(
    async () => enableService(projectId, api, accessToken),
    `enableService ${api}`,
    progress
  );

  const verifiedState = await callWithRetry(
    async () => getServiceState(projectId, api, accessToken),
    `verifyService ${api}`,
    progress
  );

  if (verifiedState !== "ENABLED") {
    throw new Error(
      `API [${api}] was not ENABLED after enablement operation completed (state: ${verifiedState})`
    );
  }
}

/**
 * Attempts to enable a single API with one automatic retry on failure.
 */
export async function enableApiWithRetry(
  projectId: string,
  api: string,
  accessToken: string,
  progress?: ProgressCallback
): Promise<void> {
  try {
    await checkAndEnableApi(projectId, api, accessToken, progress);
  } catch {
    progress?.({
      data: `Failed to check/enable ${api}, retrying in 1s...`,
      level: "warn",
    });

    await delay(RETRY.ENABLE_RETRY_MS);

    try {
      await checkAndEnableApi(projectId, api, accessToken, progress);
    } catch (retryError: unknown) {
      const message = `Failed to ensure API [${api}] is enabled after retry. Please check manually.`;
      progress?.({ data: message, level: "error" });
      throw new Error(message, { cause: retryError });
    }
  }
}

/**
 * Enables prerequisite APIs, then enables `apis`.
 * Returns a list of APIs that failed to enable (empty on full success).
 * Progress is reported via the optional callback — no direct console output.
 */
export async function ensureApisEnabled(
  projectId: string,
  apis: string[],
  accessToken: string,
  progress?: ProgressCallback
): Promise<string[]> {
  const failed: string[] = [];

  for (const api of PREREQUISITE_APIS) {
    try {
      await enableApiWithRetry(projectId, api, accessToken, progress);
    } catch (error: unknown) {
      const message = errorMessage(error);
      progress?.({
        data: `Failed to enable prerequisite API [${api}]: ${message}`,
        level: "error",
      });
      failed.push(api);
    }
  }

  if (failed.length > 0) {
    progress?.({
      data: "Skipping dependent APIs because prerequisite API enablement failed.",
      level: "error",
    });
    return [...failed, ...apis];
  }

  progress?.({
    data: "Checking and enabling required APIs...",
    level: "info",
  });

  for (const api of apis) {
    try {
      await enableApiWithRetry(projectId, api, accessToken, progress);
    } catch (error: unknown) {
      const message = errorMessage(error);
      progress?.({
        data: `Failed to enable API [${api}]: ${message}`,
        level: "error",
      });
      failed.push(api);
    }
  }

  if (failed.length === 0) {
    progress?.({
      data: "All required APIs are enabled.",
      level: "info",
    });
  }

  return failed;
}
