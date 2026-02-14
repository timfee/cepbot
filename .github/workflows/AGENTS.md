# CI/CD Workflows

GitHub Actions workflow definitions.

## Workflows

### `ci.yml` — Lint, Build & Test

Triggered on pull requests and pushes to `main`. Runs:

1. `npm ci` — Install dependencies
2. `npm run check` — Lint + type-aware checks (Ultracite)
3. `npm run typecheck` — TypeScript type checking
4. `npm run build` — esbuild bundle
5. `npm test` — Unit tests with coverage
6. Coverage report posted as PR comment (PRs only)
7. Auto-commits updated `dist/` bundle on pushes to `main`

The build auto-commit step ensures the committed `dist/index.js` bundle always
matches the latest source. This is necessary because `gemini-extension.json`
references `dist/index.js` directly — consumers install the extension without
running a build step.
