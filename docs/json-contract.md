# JSON Output Contract

`ub <command> --json` is a stable API. This document is what
integrators and pipeline authors should read first.

- [Design rationale](#design-rationale)
- [Streams](#streams)
- [Success shapes](#success-shapes)
- [Error envelope](#error-envelope)
- [Error kinds and exit codes](#error-kinds-and-exit-codes)
- [Compatibility promise](#compatibility-promise)

---

## Design rationale

The full reasoning is in
[ADR 0003](adr/0003-output-stream-contract.md). The short version:

- A human wants success on stdout and errors on stderr.
- A scripting caller running `ub … --json | jq` wants *everything* on
  stdout so `jq` doesn't silently receive nothing on failure.
- The contract below threads both needs with no `2>&1` trickery.

---

## Streams

| Mode | Success → | Error → | Exit |
|---|---|---|---|
| Human (default) | stdout | stderr | 0 on success, see table below |
| JSON (`--json`) | stdout | stdout | Same |

Human mode also writes transient warnings (e.g. `--limit` clamping)
to stderr so they don't corrupt a stdout-captured result.

---

## Success shapes

### `ub show <id> --json`

A single `Feedback` object. Known fields:

```json
{
  "id": 1234,
  "projectId": 7,
  "feedbackType": "Bug",
  "title": "Checkout is broken",
  "description": "500 on submit",
  "priority": "high",
  "category": "billing",
  "rating": "3",
  "created": "2026-04-10T09:00:00Z",
  "modified": "2026-04-12T14:22:00Z"
}
```

The API may include additional fields; the CLI passes them through
untouched. Don't assume the set is closed.

### `ub list --json`

A JSON array of `Feedback` objects. Empty result is `[]`. The CLI
unwraps the API's `{"data": [...]}` envelope so callers always see a
plain array.

### `ub create --json`

The full created `Feedback` object (same shape as `ub show --json`).
Without `--json`, human mode prints just `<id>\n`.

### `ub close <id> --json`

On success:

```json
{ "closed": true, "id": 1234 }
```

On partial success (PATCH worked but the optional comment failed),
the envelope merges the close result with an error:

```json
{
  "closed": true,
  "comment": {
    "error": {
      "kind": "http",
      "message": "HTTP 500: ...",
      "status": 500,
      "body": "..."
    }
  }
}
```

Exit code is `6` in that case — the close landed, but the overall
invocation didn't fully succeed.

### `ub comment <id> --json`

A `Comment` object:

```json
{
  "id": 98,
  "feedbackId": 1234,
  "comment": "Reproduced on Safari 17.4",
  "created": "2026-04-19T12:00:00Z"
}
```

---

## Error envelope

Every error in JSON mode has the same top-level shape:

```json
{
  "error": {
    "kind": "validation",
    "message": "HTTP 422: {\"message\":\"Workflow not found\"}",
    "status": 422,
    "body": { "message": "Workflow not found", "status": 422 }
  }
}
```

| Field | Type | Present when |
|---|---|---|
| `error.kind` | string | Always. One of the values in the table below. |
| `error.message` | string | Always. Human-readable summary. |
| `error.status` | integer | HTTP errors only. |
| `error.body` | any | HTTP errors only. Parsed JSON body if the API returned JSON, otherwise the raw text. |

The envelope is always a single line, followed by a newline. Safe to
pipe to `jq -r '.error.kind'`.

---

## Error kinds and exit codes

| `kind` | Exit | Meaning |
|---|---|---|
| `config` | `2` | Bad args or missing env var (no HTTP request made). |
| `unauthorized` | `3` | `401` from the API. |
| `not_found` | `4` | `404` from the API. |
| `validation` | `5` | `422` from the API. |
| `http` | `6` | Any other non-2xx (`429`, `4xx` we don't special-case). |
| `server` | `6` | `5xx` from the API. |
| `network` | `7` | Couldn't reach the API at all. |
| `unexpected` | `1` | Bug in the CLI. Please file one. |

See [troubleshooting.md](troubleshooting.md) for remediation.

---

## Compatibility promise

Pre-`1.0`, we commit to:

- Not removing or renaming fields in success payloads without a
  deprecation note in
  [`CHANGELOG.md`](../CHANGELOG.md).
- Not changing the `error` envelope shape.
- Not changing the meaning of any exit code in the table above.

We may add new fields to success payloads, new `kind` values for
genuinely new error categories, and new commands / flags — those are
additive and don't break scripts.

Post-`1.0`, any breaking change to the contract is a major version
bump.
