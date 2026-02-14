/**
 * Tool execution wrapper — auto-resolves customer IDs, normalizes
 * org unit IDs, validates input, and catches errors so every tool
 * returns a structured MCP response.
 */

import { getCustomerId } from "@lib/api/admin-sdk";
import { errorMessage } from "@lib/constants";
import { formatDegradedModeError, getServerState } from "@lib/server-state";

import { getAuthToken, validateAndGetOrgUnitId } from "./schemas";

/**
 * In-memory cache for the resolved customer ID so it only needs
 * to be fetched once per server lifetime.
 */
export class CustomerIdCache {
  private value: string | null = null;

  clear(): void {
    this.value = null;
  }

  get(): string | null {
    return this.value;
  }

  set(id: string): void {
    this.value = id;
  }
}

/**
 * Singleton cache instance shared by all tool calls.
 */
export const customerIdCache = new CustomerIdCache();

interface ToolParams {
  customerId?: string;
  orgUnitId?: string;
  [key: string]: unknown;
}

interface ToolContext {
  requestInfo?: {
    headers?: { authorization?: string };
  };
}

interface ToolContent {
  text: string;
  type: "text";
}

interface ToolResult {
  [key: string]: unknown;
  content: ToolContent[];
  isError?: boolean;
}

interface GuardedToolCallConfig<TParams extends ToolParams> {
  handler: (params: TParams, context: ToolContext) => Promise<ToolResult>;
  skipAutoResolve?: boolean;
  transform?: (params: TParams) => TParams;
  validate?: (params: TParams) => void;
}

function commonTransform<TParams extends ToolParams>(params: TParams): TParams {
  const newParams = { ...params };
  if (newParams.orgUnitId) {
    newParams.orgUnitId = validateAndGetOrgUnitId(newParams.orgUnitId);
  }
  return newParams;
}

/**
 * Wraps a tool handler with automatic customer ID resolution,
 * org unit normalization, optional validation, optional transforms,
 * and top-level error catching.
 */
export function guardedToolCall<TParams extends ToolParams>(
  config: GuardedToolCallConfig<TParams>
): (params: TParams, context: ToolContext) => Promise<ToolResult> {
  return async (params: TParams, context: ToolContext): Promise<ToolResult> => {
    const serverState = getServerState();
    if (serverState.status === "degraded") {
      return {
        content: [
          {
            text: formatDegradedModeError(serverState.error),
            type: "text" as const,
          },
        ],
        isError: true,
      };
    }

    try {
      if (params.customerId) {
        customerIdCache.set(params.customerId);
      }

      if (!config.skipAutoResolve && params.customerId === undefined) {
        const cached = customerIdCache.get();
        if (cached) {
          params.customerId = cached;
        } else {
          try {
            const authToken = getAuthToken(context?.requestInfo);
            const customer = await getCustomerId(authToken);

            if (customer?.id) {
              customerIdCache.set(customer.id);
              params.customerId = customer.id;
            }
          } catch {
            // Non-fatal: tools can still work without customer ID
          }
        }
      }

      let transformedParams = commonTransform(params);

      if (config.transform) {
        transformedParams = config.transform(transformedParams);
      }

      if (config.validate) {
        config.validate(transformedParams);
      }

      return await config.handler(transformedParams, context);
    } catch (error: unknown) {
      const message = errorMessage(error);
      return {
        content: [{ text: `Error: ${message}`, type: "text" as const }],
        isError: true,
      };
    }
  };
}
