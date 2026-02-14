# Unit Tests

Vitest unit tests with 100% code coverage requirement. Test structure mirrors
`src/` — every source module has a corresponding `.test.ts` file.

## Structure

```
tests/
  lib/              Tests for src/lib/ modules
    api/            Tests for src/lib/api/ modules
  tools/            Tests for src/tools/ (register, schemas, guarded-tool-call)
    definitions/    Tests for individual tool implementations
  prompts/          Tests for src/prompts/ (register, content)
    definitions/    Tests for individual prompt implementations
```

## Running

```bash
npm test              # Run with coverage
npm run test:watch    # Watch mode
```

## Conventions

- 100% coverage threshold for branches, functions, lines, and statements.
- Use `vi.mock()` for external dependencies (Google APIs, gcloud CLI, etc.).
- Use `vi.spyOn()` for internal module functions.
- Test files use `.test.ts` suffix.
- Assertions go inside `it()` or `test()` blocks, never in `describe()`.
- Use `async`/`await` instead of done callbacks.
- Never commit `.only` or `.skip`.
