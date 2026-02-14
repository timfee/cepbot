/**
 * Centralized server health state — tracks whether bootstrap succeeded,
 * failed, or is still in progress. Read by guardedToolCall to block
 * tool execution when the server is in degraded mode.
 */

/**
 * Category of bootstrap failure for programmatic branching.
 */
export type BootstrapErrorType =
  | "adc_credentials"
  | "api_enablement"
  | "gcloud_missing"
  | "quota_project"
  | "scope_missing"
  | "unknown";

/**
 * Structured bootstrap error with agent-directive instructions.
 */
export interface BootstrapError {
  /** Exact instruction for the AI agent on what to do. */
  agentAction: string;
  /** Which APIs failed enablement, if any. */
  apiFailures?: string[];
  /** The underlying error for debugging. */
  cause?: unknown;
  /** Human-readable description of what went wrong. */
  problem: string;
  /** Structured category for programmatic branching. */
  type: BootstrapErrorType;
}

type ServerState =
  | { error: BootstrapError; status: "degraded" }
  | { projectId: string; region: string; status: "healthy" }
  | { status: "booting" };

let state: ServerState = { status: "booting" };

/**
 * Returns the current server health state for use in tool guards.
 */
export function getServerState(): ServerState {
  return state;
}

/**
 * Transitions the server to a healthy state after a successful bootstrap.
 */
export function setServerHealthy(projectId: string, region: string): void {
  state = { projectId, region, status: "healthy" };
}

/**
 * Transitions the server to degraded mode when bootstrap fails,
 * storing the error for display in tool responses.
 */
export function setServerDegraded(error: BootstrapError): void {
  state = { error, status: "degraded" };
}

/**
 * Resets the server state to "booting" for test isolation.
 * @internal
 */
export function _resetServerStateForTesting(): void {
  state = { status: "booting" };
}

/**
 * Formats a BootstrapError into agent-directive text suitable for
 * returning as an MCP tool error response.
 */
export function formatDegradedModeError(error: BootstrapError): string {
  const sections = [
    `## Problem\n${error.problem}`,
    `## AGENT ACTION REQUIRED\n${error.agentAction}`,
  ];

  if (error.apiFailures && error.apiFailures.length > 0) {
    sections.push(
      `## Failed APIs\n${error.apiFailures.map((a) => `- ${a}`).join("\n")}`
    );
  }

  sections.push(
    "## Recovery\nAfter the user completes the action above, call the `retry_bootstrap` tool to re-initialize the server."
  );

  return sections.join("\n\n");
}
