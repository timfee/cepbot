/**
 * AfterTool hook for create_dlp_rule.
 *
 * Steers the model through the two-step creation flow:
 *
 *   1. validate-only call succeeds  -> offer to create
 *   2. real creation call succeeds  -> offer to verify
 *
 * Both branches inject additionalContext so the model
 * knows what to suggest next without relying solely on
 * the system prompt.
 */

let data = "";
for await (const chunk of process.stdin) {
  data += chunk;
}

const { tool_input: input } = JSON.parse(data);

if (input?.validateOnly === true) {
  process.stdout.write(
    JSON.stringify({
      decision: "allow",
      hookSpecificOutput: {
        hookEventName: "AfterTool",
        additionalContext:
          "Validation passed. Summarize the rule for " +
          "the user (name, action, triggers, condition, " +
          "target Organizational Unit) and offer to " +
          "create it by calling create_dlp_rule again " +
          "with validateOnly omitted or set to false.",
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
