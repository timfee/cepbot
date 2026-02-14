# MCP Prompts

Prompt registration, shared content, and builder utilities for MCP prompt
definitions.

## Files

| File | Purpose |
|---|---|
| `register.ts` | Registers all prompts with the MCP server |
| `content.ts` | Shared persona preamble, task instructions, and `buildPromptResult()` builder |
| `definitions/` | Individual prompt implementations (see `definitions/AGENTS.md`) |

## Conventions

- All prompts use a single `"user"` role message combining the persona preamble
  with task-specific instructions. This avoids `"assistant"` role prefilling
  which behaves inconsistently across MCP clients.
- The `PERSONA` constant defines the agent's role across all prompts.
- Prompt registration functions follow the naming pattern `register<Name>Prompt()`.
- Use `buildPromptResult(taskInstructions, description)` to construct the
  standard prompt result format.
