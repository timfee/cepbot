# MCP Server

The main workspace containing the Chrome Enterprise Premium MCP server.

## Structure

- `src/` — TypeScript source code
- `dist/` — Bundled output (committed to repo, built by CI)
- `tests/` — Unit tests (vitest, 100% coverage required)
- `e2e/` — End-to-end tests against real Google APIs

## Build

```bash
npm run build    # esbuild bundle → dist/index.js
```

The build uses `esbuild.config.mjs` to produce a single minified ESM bundle
with a Node.js shebang. Path aliases (`@lib`, `@tools`, `@prompts`) are
resolved at build time. The package version is injected via `__VERSION__`.

## Key Commands

| Command             | Purpose                      |
| ------------------- | ---------------------------- |
| `npm run build`     | Bundle with esbuild          |
| `npm test`          | Unit tests with coverage     |
| `npm run check`     | Lint + typecheck (Ultracite) |
| `npm run fix`       | Auto-fix lint issues         |
| `npm run typecheck` | Type-check only              |
| `npm run test:e2e`  | E2E tests (requires ADC)     |

## Conventions

- ES modules (`"type": "module"`)
- Node.js >= 20 target
- Path aliases: `@lib/*`, `@tools/*`, `@prompts/*` (defined in tsconfig.json)
- 100% code coverage threshold for unit tests
- Ultracite (Oxlint + Oxfmt) for linting and formatting
