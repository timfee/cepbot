/**
 * AfterTool hook for create_dlp_rule.
 *
 * Steers the model through the two-step creation flow:
 *
 *   1. validate-only call succeeds  -> offer to create
 *   2. real creation call succeeds  -> offer to verify
 *
 * If the tool returned an error, the hook tells the model
 * to explain the failure instead of suggesting next steps
 * that assume success.
 *
 * Both branches inject additionalContext so the model
 * knows what to suggest next without relying solely on
 * the system prompt.
 */

let data = "";
for await (const chunk of process.stdin) {
  data += chunk;
}

const { tool_input: input, tool_output: output } = JSON.parse(data);

// Detect tool-level errors before injecting success guidance.
const toolFailed =
  output?.isError === true ||
  output?.content?.some((c) => c.type === "text" && c.text?.startsWith("Error:"));

if (toolFailed) {
  process.stdout.write(
    JSON.stringify({
      decision: "allow",
      hookSpecificOutput: {
        hookEventName: "AfterTool",
        additionalContext:
          "The create_dlp_rule call failed. Explain the " +
          "error to the user in plain language and suggest " +
          "a concrete next step (for example, check the " +
          "Organizational Unit ID with list_org_units, or " +
          "verify credentials with retry_bootstrap).",
      },
    })
  );
} else if (input?.validateOnly === true) {
  process.stdout.write(
    JSON.stringify({
      decision: "allow",
      hookSpecificOutput: {
        hookEventName: "AfterTool",
        additionalContext:
          "Validation passed. Summarize the rule for " +
          "the user (displayName, action, triggers, " +
          "condition, target Organizational Unit) and " +
          "offer to create it by calling create_dlp_rule " +
          "again with validateOnly omitted or set to false.",
      },
    })
  );
} else {
  process.stdout.write(
    JSON.stringify({
      decision: "allow",
      hookSpecificOutput: {
        hookEventName: "AfterTool",
        additionalContext:
          "The Data Loss Prevention rule was created. " +
          "Offer to verify it with list_dlp_rules, or " +
          "check that the relevant connectors are " +
          "enabled for the target Organizational Unit " +
          "using get_connector_policy.",
      },
    })
  );
}
