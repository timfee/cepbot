# Core Library

Shared infrastructure modules used by tools, prompts, and the server entry
point. These handle authentication, bootstrapping, API communication, error
handling, and server state.

## Modules

| File | Responsibility |
|---|---|
| `constants.ts` | API base URLs, OAuth scopes, service names, retry config, DLP triggers |
| `auth.ts` | ADC verification, token introspection, scope validation |
| `bootstrap.ts` | Server initialization sequence (gcloud → ADC → scopes → project → APIs → customer ID) |
| `server-state.ts` | Health state singleton (`healthy` / `degraded` / `booting`) |
| `agent-errors.ts` | Structured errors with human-readable problem + recovery instructions |
| `gcp.ts` | GCP metadata server detection |
| `gcloud.ts` | gcloud CLI interaction, ADC file reading, quota project management |
| `projects.ts` | Fallback GCP project creation |
| `apis.ts` | API enablement with exponential backoff and progress logging |
| `clients.ts` | Low-level GCP REST operations (enable API, poll operations) |
| `api/` | Google API client modules (see `api/AGENTS.md`) |

## Conventions

- Functions return discriminated unions (`{ ok: true, ... } | { ok: false, reason }`)
  instead of throwing for expected failures.
- Caught errors are always typed as `unknown` and narrowed with `instanceof Error`.
- The `errorMessage()` helper in `constants.ts` safely extracts messages from unknown values.
- Progress callbacks follow the `ProgressCallback` type from `apis.ts` for
  structured logging during bootstrap and API enablement.
