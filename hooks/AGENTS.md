# Hooks

Gemini CLI extension hooks for the DLP rule creation workflow. These are
referenced by `hooks.json` and executed as standalone Node.js scripts.

## Files

- `hooks.json` — Hook configuration declaring BeforeTool and AfterTool triggers.
- `validate-dlp-action.mjs` — **BeforeTool** hook on `create_dlp_rule`. Blocks
  BLOCK-mode actions and injects a system message suggesting WARN or AUDIT.
- `dlp-creation-followup.mjs` — **AfterTool** hook on `create_dlp_rule`. Guides
  the validate-then-create workflow by offering next steps after validation or
  creation.

## Conventions

- Hooks read JSON from stdin and write a JSON decision to stdout.
- Decisions use `{ decision: "allow" }` or `{ decision: "block", reason, systemMessage }`.
- After-tool hooks inject `additionalContext` to guide the model's next action.
- Scripts are plain `.mjs` (ES modules) with no build step or dependencies.
