# Troubleshooting

When `ub` reports an error, this page explains what happened and how
to fix it. Errors are tagged with a `kind` in JSON mode
(`config`, `unauthorized`, `not_found`, `validation`, `http`,
`server`, `network`, `unexpected`) — the sections below are organized
by that kind.

If you hit something not covered here, re-run with `UB_DEBUG=1` to
include a stack trace and
[open an issue](https://github.com/beflagrant/userback-cli/issues/new/choose).

- [`config` — setup and argument errors](#config--setup-and-argument-errors)
- [`unauthorized` — 401 from the API](#unauthorized--401-from-the-api)
- [`not_found` — 404 from the API](#not_found--404-from-the-api)
- [`validation` — 422 from the API](#validation--422-from-the-api)
- [`server` — 5xx from the API](#server--5xx-from-the-api)
- [`http` — other non-2xx response](#http--other-non-2xx-response)
- [`network` — couldn't reach the API](#network--couldnt-reach-the-api)
- [`unexpected` — anything else](#unexpected--anything-else)
- [Debug mode](#debug-mode)

---

## `config` — setup and argument errors

**Exit code:** `2`. The CLI rejected the arguments or env vars
before making any HTTP request.

### `ub: config: USERBACK_API_KEY is required`

The token is missing. Set it in your shell:

```sh
export USERBACK_API_KEY="ub_..."
```

If you want a one-shot without exporting:

```sh
USERBACK_API_KEY="ub_..." ub list --limit 1
```

### `ub: config: --project-id or USERBACK_DEFAULT_PROJECT_ID is required`

`ub create` needs a project id. Pass `--project-id 123` or export
`USERBACK_DEFAULT_PROJECT_ID=123`.

### `ub: config: feedbackId must be a positive integer, got: foo`

You passed something non-numeric where an id was expected. The CLI
validates ids before hitting the API.

### `ub: config: --type must be one of General|Bug|Idea, got: Task`

Userback's API enforces a fixed feedback type vocabulary. Pick one
of the three.

### `ub: config: --priority must be one of low|neutral|high|urgent, got: medium`

Same story for priority.

---

## `unauthorized` — 401 from the API

**Exit code:** `3`.

### `ub: unauthorized: HTTP 401: ...`

Your token was rejected. Common causes:

- Token typo or trailing whitespace — `echo "$USERBACK_API_KEY" | wc -c`
  should be the token length plus one (the trailing newline).
- Token revoked or expired in Workspace Settings → API Tokens.
- Using a workspace token against a different workspace's base URL
  (rare — only relevant if you set `USERBACK_BASE_URL`).

Regenerate the token and re-export it.

---

## `not_found` — 404 from the API

**Exit code:** `4`.

### `ub: not_found: HTTP 404: ...`

The feedback id or resource doesn't exist. Sanity-check with
`ub list --limit 5` to confirm you're pointed at the right workspace.

---

## `validation` — 422 from the API

**Exit code:** `5`. The API accepted the request shape but rejected
the content.

### `ub: validation: HTTP 422: {"message":"Workflow not found"}` on `ub close`

Your workspace's workflow doesn't have a stage named `Resolved` (the
default). Open the Status Board and use the actual terminal stage
name:

```sh
export USERBACK_CLOSED_STATUS="Done"
```

Or target by numeric id:

```sh
export USERBACK_CLOSED_STATUS="9"
```

See [ADR 0001](adr/0001-close-via-workflow-stage.md).

### `ub: validation: HTTP 422: ...` on `ub create`

The API rejected a field. In JSON mode the full error body is
included:

```sh
ub create --title "x" --body "y" --json | jq .error.body
```

Common culprits: missing required field on a workspace with custom
required fields configured, or an email that doesn't match an
existing user.

### `ub: validation: HTTP 422: ...` on `ub list`

Likely an OData filter the API rejected. This can happen if
`--status` contains a character that needs different escaping than
we currently apply. File an issue with the command you ran.

---

## `server` — 5xx from the API

**Exit code:** `6`. Upstream error. Retry with exponential backoff;
if it persists, check
[Userback's status page](https://userback.io) and open an issue here
if you suspect the CLI is part of the problem.

---

## `http` — other non-2xx response

**Exit code:** `6`. Any non-2xx that isn't 401/404/422/5xx —
including `429 Too Many Requests`.

The MVP doesn't retry on 429. If you're hitting rate limits,
space requests out or batch with `--limit 50`. A retry/backoff
feature is tracked as a future enhancement.

---

## `network` — couldn't reach the API

**Exit code:** `7`. DNS, TLS, proxy, or connectivity failure. Try:

```sh
curl -I https://rest.userback.io/1.0/feedback
```

If that also fails, the problem is local (proxy, VPN, DNS). If curl
works but `ub` doesn't, re-run with `UB_DEBUG=1` and file an issue.

---

## `unexpected` — anything else

**Exit code:** `1`. A bug slipped through our typed error
hierarchy. Please file an issue with the full `UB_DEBUG=1` output.

---

## Debug mode

```sh
UB_DEBUG=1 ub show 1234
```

In debug mode the CLI appends the stack trace to stderr for
`unexpected` errors. It does **not** change what goes to stdout or
any exit code — the
[output contract](adr/0003-output-stream-contract.md) is preserved.
