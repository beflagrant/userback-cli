# ADR 0003: Output Stream Contract for Human and JSON Modes

**Date:** 2026-04-18
**Status:** Accepted

## Context

`ub` is designed to be used interactively by a human and as a
scripting target by an LLM agent or shell pipeline. Those two
consumers have different needs on success and failure paths:

- A human reading the terminal wants readable summaries, status
  messages, and errors printed in a visible place.
- A script running `ub list --json | jq '.[] | .id'` needs stdout
  to contain *only* valid JSON, even when the request fails.
  Mixing a stack trace or a "something went wrong" line into
  stdout breaks `jq` and the pipeline silently returns the wrong
  thing.

Conventional Unix practice is "results to stdout, diagnostics to
stderr." But `--json` mode complicates it: a structured error is
itself a result in JSON mode, and callers want to parse it.
If errors go to stderr in JSON mode, `| jq` sees an empty stdout
and the caller has to reach for `2>&1` or separate stream
handling to get the error shape — friction that defeats the point
of structured output.

## Decision

Output streams follow this contract:

**Human mode (default):**

- Success → stdout (formatted, possibly multi-line).
- Error → stderr as `ub: <message>`. Stdout is empty.
- Exit code 0 on success, non-zero on error (see table below).

**JSON mode (`--json`):**

- Success → stdout as a single JSON value, trailing newline.
- Error → **stdout** as a single JSON object with shape
  `{ "error": { "kind": "...", "message": "...", "status": N, "body": ... } }`.
  Stderr is empty.
- Exit code 0 on success, non-zero on error. The exit code is the
  signal; the JSON body is the detail.

Exit codes:

| Condition | Exit |
|---|---|
| Success | 0 |
| Unexpected JS error | 1 |
| Config error (missing env/flag) | 2 |
| 401 Unauthorized | 3 |
| 404 Not Found | 4 |
| 422 Validation Error | 5 |
| Other HTTP error | 6 |
| Network error (DNS, timeout, refused, aborted) | 7 |

Partial-success cases (`ub close --comment` where the PATCH
succeeds but the comment POST fails) exit with code 6 and report
both outcomes in their respective modes.

## Consequences

- **Positive:** `ub list --json | jq` works on success *and* on
  failure without special-casing. The caller reads exit code to
  branch, then pipes stdout into whatever parser they want.
- **Positive:** Human mode never pollutes stdout with status
  chatter, so `ub create --title x --body y | tee log` captures
  the ID cleanly.
- **Positive:** Exit codes are stable and numeric, distinguishing
  classes of failure. Scripts can `if [ $? -eq 4 ]` to detect a
  missing feedback without parsing messages.
- **Neutral:** Putting JSON errors on stdout is unconventional
  for Unix tools but matches the behavior of most modern
  JSON-first CLIs (`gh`, `kubectl -o json` error shape, etc.)
  where the JSON itself is the payload.
- **Negative:** Callers who redirect stderr expecting to catch
  errors (`ub list --json 2>/dev/null`) get no diagnostic on
  failure — they must check stdout (and exit code). This needs
  to be documented in the README.
- **Negative:** Two output code paths per command (human vs.
  JSON) — a small amount of duplication in the formatter. This
  is intentional: the alternative is one branching formatter,
  which is harder to read than two clear ones.

## References

- ADR 0002 for the overall stack these outputs flow through.
- Parallel decision in the sibling Ruby project
  (`/Users/jim/code/userback-ruby/docs/adr/0003-output-stream-contract.md`).
