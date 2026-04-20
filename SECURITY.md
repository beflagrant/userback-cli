# Security Policy

## Supported versions

`userback-cli` is pre-`1.0`. Only the most recent minor release line
receives security fixes. Once `1.0` ships, this table will widen.

| Version | Supported |
|---|---|
| `0.1.x` | ✅ |
| Older   | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue.**

Email `jim@beflagrant.com` with:

- A description of the issue and its impact.
- Steps to reproduce, or a minimal proof-of-concept.
- Affected version(s) (output of `ub --version`).
- Your name or handle for credit (optional).

You should receive an acknowledgement within 3 business days. We
aim to:

- Confirm or dismiss the report within 7 days.
- Ship a fix for confirmed high-severity issues within 30 days.
- Publish a GitHub Security Advisory once the fix is available.

## Scope

In scope:

- Credential leakage (e.g. `USERBACK_API_KEY` appearing in logs,
  error output, or crash reports).
- Injection via command-line arguments or env vars into the HTTP
  client or shell.
- Dependency vulnerabilities affecting the runtime path
  (`commander` or Node built-ins we rely on).

Out of scope:

- Userback's REST API itself — report those to Userback directly.
- Vulnerabilities in optional dev-only dependencies (`tsx`,
  `typescript`, `undici`) that don't affect the published runtime.
- Denial of service by abusing the API key you legitimately
  control.

## Safe-harbor

We won't pursue or support any legal action related to research
conducted in good faith and consistent with this policy. Please
avoid testing against workspaces you don't own.
