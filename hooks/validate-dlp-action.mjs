/**
 * BeforeTool hook for create_dlp_rule.
 *
 * This extension only permits WARN and AUDIT actions.
 * The MCP server enforces this too, but catching it here
 * saves a round-trip and injects a system message that
 * steers the model toward a valid alternative.
 */

let data = "";
for await (const chunk of process.stdin) {
  data += chunk;
}

const { tool_input: input } = JSON.parse(data);

if (input?.action === "BLOCK") {
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        "BLOCK mode is not permitted for Data Loss " +
        "Prevention rules created through this " +
        'extension. Use "WARN" or "AUDIT" instead.',
      systemMessage:
        "The user requested a BLOCK action, but only " +
        "WARN and AUDIT are allowed. Suggest WARN as " +
        "an alternative and explain the difference: " +
        "WARN shows the user a message but lets them " +
        "proceed, while AUDIT silently logs the event.",
    })
  );
} else {
  process.stdout.write(JSON.stringify({ decision: "allow" }));
}
