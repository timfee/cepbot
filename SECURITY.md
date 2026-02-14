# Security Policy

## Scope

Cepbot is an **unofficial**, self-hosted MCP server for Chrome Enterprise
Premium. It runs locally and authenticates using your own Google Cloud
Application Default Credentials. No data is sent to third-party services beyond
the Google APIs it wraps.

## Supported Versions

Only the latest release on the `main` branch is actively maintained. There are
no long-term support branches.

## Reporting a Vulnerability

If you discover a security issue, please report it responsibly:

1. **Do not** open a public GitHub issue.
2. Use [GitHub's private vulnerability reporting](https://github.com/timfee/cepbot/security/advisories/new)
   to submit a confidential report.
3. Include a clear description of the issue, steps to reproduce, and any
   potential impact.

You should expect an initial response within 7 days. If the report is accepted,
a fix will be prioritized and credited in the release notes (unless you prefer
to remain anonymous).

## Best Practices for Users

- **Never commit credentials.** Use Application Default Credentials via
  `gcloud auth application-default login`; do not store tokens or service
  account keys in the repository.
- **Restrict API scopes.** Grant only the OAuth scopes required by cepbot.
- **Review before running.** This is community software provided as-is under
  the Apache-2.0 license. Audit the source before deploying it in your
  environment.

## Ethical Disclosure

Please act in good faith. Do not access, modify, or delete data belonging to
others. If your testing inadvertently exposes someone else's data, stop
immediately and include the details in your report so it can be addressed.
