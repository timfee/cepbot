/**
 * Shared prompt content — persona preamble, task instructions, and
 * builder used across all prompt definitions.
 *
 * All prompts use a single "user" role message that combines the
 * persona context with the task instructions. This avoids reliance
 * on "assistant" role prefilling semantics which are handled
 * inconsistently across MCP clients.
 */

import type { GetPromptResult } from "@modelcontextprotocol/sdk/types";

/**
 * Persona preamble prepended to every prompt's instructions so the
 * agent knows its role before executing.
 */
export const PERSONA =
  "You are a Chrome Enterprise Premium security expert. You have MCP tools available to query and configure the user's environment.";

/**
 * Directive instructions for the default `/cep` prompt — starts
 * a health check immediately without waiting for user input.
 */
export const HEALTH_CHECK_STEPS = `Do not list your tools. Do not ask what the user wants. Begin executing a health check immediately by calling tools.

Step 1: Call \`list_org_units\` to get the organizational unit tree.
Step 2: For each organizational unit, call \`get_connector_policy\` to check security connector settings.
Step 3: Call \`list_dlp_rules\` to get DLP rule configurations.
Step 4: Call \`count_browser_versions\` to get browser version distribution.
Step 5: Call \`list_customer_profiles\` to get managed browser profiles.

For each organizational unit, evaluate:
- Is Chrome Browser Cloud Management (CBCM) enrollment active?
- Do browsers report to the admin console?
- Is the Chrome browser version current?
- Is an active Chrome Enterprise Premium license assigned?
- Are security connectors set to **Chrome Enterprise Premium**?
- Is **Delay file upload** configured for enforcement?
- Is **Enhanced Safe Browsing** enabled?
- Are Data Loss Prevention (DLP) rules enabled?
- Is reporting enabled for DLP events?

Summarize findings by severity (critical → warning → info). For each issue, state what is misconfigured, the security impact, and the specific fix.`;

/**
 * Detailed instructions for `/cep:diagnose` — plans tool calls
 * and executes independent checks in parallel.
 */
export const DIAGNOSE_INSTRUCTIONS = `Do not list your tools. Do not ask what the user wants. Execute a comprehensive health check immediately, maximizing parallelism by calling independent tools simultaneously.

## Phase 1 — Gather baseline data (call all of these tools at the same time)
- \`list_org_units\` — get the organizational unit tree
- \`list_dlp_rules\` — get all DLP rule configurations
- \`list_customer_profiles\` — get managed Chrome browser profiles
- \`count_browser_versions\` — get browser version distribution

## Phase 2 — Per-OU security checks (call in parallel for each OU)
For each organizational unit returned in Phase 1, call \`get_connector_policy\`.

Using data from both phases, evaluate each OU against this checklist:
- Is Chrome Browser Cloud Management (CBCM) enrollment active?
- Do browsers report to the admin console?
- Is the Chrome browser version current?
- Is an active Chrome Enterprise Premium license assigned?
- Are security connectors set to **Chrome Enterprise Premium**?
- Is **Delay file upload** configured for enforcement?
- Is **Enhanced Safe Browsing** enabled?
- Are Data Loss Prevention (DLP) rules enabled?
- Is reporting enabled for DLP events?

## Phase 3 — Report
Summarize findings by severity (critical → warning → info). For each issue found:
1. State what is misconfigured and in which OU
2. Explain the security impact
3. Recommend the specific fix`;

/**
 * Instructions for DLP maturity assessment.
 */
export const MATURITY_STEPS = `Do not ask what the user wants. Begin a DLP maturity assessment immediately by calling tools.

Step 1: Call \`list_org_units\` to get the organizational unit tree.
Step 2: Call \`list_dlp_rules\` to get all DLP rule configurations.
Step 3: Call \`get_chrome_activity_log\` to get DLP event telemetry.
Step 4: Analyze the DLP rule configuration and telemetry to determine the maturity stage.
Step 5: Recommend next steps to improve DLP maturity.`;

/**
 * Instructions for DLP rule noise analysis.
 */
export const NOISE_STEPS = `Do not ask what the user wants. Begin a DLP noise analysis immediately by calling tools.

Step 1: Call \`list_dlp_rules\` to get all DLP rule configurations.
Step 2: Call \`get_chrome_activity_log\` to get DLP event telemetry.
Step 3: Identify DLP rules with high false positive rates or override rates.
Step 4: Recommend optimization actions to reduce rule noise.`;

/**
 * Constructs an MCP prompt result as a single user-role message
 * combining the persona preamble with the task instructions.
 */
export function buildPromptResult(
  taskInstructions: string,
  description?: string
): GetPromptResult {
  return {
    description,
    messages: [
      {
        content: {
          text: `${PERSONA}\n\n${taskInstructions}`,
          type: "text",
        },
        role: "user",
      },
    ],
  };
}
