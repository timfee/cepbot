# MCP Tools

Tool registration, shared schemas, and the execution wrapper for all MCP tools.

## Files

| File                   | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `register.ts`          | Registers all standard tools with the MCP server and seeds the customer ID cache                        |
| `schemas.ts`           | Shared Zod schemas (`orgUnitId`, `customerId`) and validation utilities                                 |
| `guarded-tool-call.ts` | Execution wrapper: auto-resolves customer IDs, normalizes org unit IDs, validates input, catches errors |
| `definitions/`         | Individual tool implementations (see `definitions/AGENTS.md`)                                           |

## Execution Flow

1. Tool is called by an MCP client
2. `guardedToolCall()` checks server health (rejects if degraded)
3. Customer ID is auto-resolved from cache or fetched via Admin SDK
4. Org unit IDs are normalized via `validateAndGetOrgUnitId()`
5. Optional `transform` and `validate` hooks run
6. The tool's `handler` executes
7. Errors are caught and returned as structured MCP error responses

## Conventions

- Tools use `guardedToolCall()` for consistent error handling and auto-resolution.
- Exception: `retry_bootstrap` is registered separately in `index.ts` to bypass
  the degraded-mode guard.
- The `CustomerIdCache` singleton avoids repeated Admin SDK calls.
- Tool registration functions follow the naming pattern `register<Name>Tool()`.
