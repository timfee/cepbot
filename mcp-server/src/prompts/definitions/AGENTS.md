# Prompt Definitions

Individual MCP prompt implementations. Each file exports a single
`register<Name>Prompt(server)` function.

## Prompts

| File          | Prompt Name | Purpose                                                                                |
| ------------- | ----------- | -------------------------------------------------------------------------------------- |
| `cep.ts`      | `cep`       | Default health check — gathers baseline data, checks per-OU security, reports findings |
| `diagnose.ts` | `diagnose`  | Comprehensive bootstrap diagnosis and environment health check                         |
| `maturity.ts` | `maturity`  | DLP maturity assessment across organizational units                                    |
| `noise.ts`    | `noise`     | DLP rule noise analysis — identifies high false-positive rules                         |

## Adding a New Prompt

1. Create `<prompt-name>.ts` in this directory with a `register<Name>Prompt(server)` export.
2. Define task instructions as a constant string with phased execution steps.
3. Use `buildPromptResult()` from `../content` to construct the response.
4. Add the registration call to `../register.ts`.
5. Write unit tests in `tests/prompts/definitions/`.
