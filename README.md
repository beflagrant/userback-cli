# userback-cli

Command-line tool for the [Userback](https://userback.io) REST API.

Install as `userback-cli`; invoke as `ub`. Designed to be called by
LLM agents in shell pipelines: every command supports `--json` for
structured output, and exit codes are stable per class of failure.

## Install

```sh
npm install -g userback-cli
ub --help
```

Requires Node.js 24 or later.

## Configuration

Set these environment variables:

| Var | Required | Purpose |
|---|---|---|
| `USERBACK_API_KEY` | Yes | Bearer token from Workspace Settings → API Tokens. |
| `USERBACK_BASE_URL` | No | Override the API base URL. Defaults to `https://rest.userback.io/1.0`. |
| `USERBACK_DEFAULT_PROJECT_ID` | Required for `ub create` unless `--project-id` is passed | Numeric project id. |
| `USERBACK_DEFAULT_EMAIL` | Required for `ub create` unless `--email` is passed | Submitter email. |
| `USERBACK_CLOSED_STATUS` | No | Workflow stage name for `ub close`. Defaults to `"Resolved"` (the terminal stage in the default Userback workflow). See below. |
| `UB_DEBUG` | No | Set to `1` to include stack traces on unexpected errors. |

## Commands

```sh
ub list [--json] [--limit N] [--type Bug|Idea|General] [--project-id ID] [--status NAME]
ub show <id> [--json]
ub create --title "..." --body "..." [--type ...] [--priority ...] [--project-id ID] [--email E] [--json]
ub close <id> [--comment "..."] [--json]
ub comment <id> --body "..." [--json]
```

## Examples

List the 10 most recent Bug-type feedback items, pretty-printed:

```sh
ub list --type Bug --limit 10
```

Fetch everything in JSON and pipe to `jq`:

```sh
ub list --json | jq '.[] | {id, title, priority}'
```

File a new bug:

```sh
ub create --title "Bug in checkout" --body "500 on submit"
```

View a single feedback item:

```sh
ub show 123
```

Close a feedback item with a note:

```sh
ub close 123 --comment "Fixed in deploy 2026-04-18"
```

Add a comment without closing:

```sh
ub comment 123 --body "Reproduced on Safari"
```

## How `close` works

The Userback API has no plain "status" field. Closing a feedback item
means PATCHing its `Workflow` to a named stage. By default, `ub close`
sends `{ "Workflow": { "name": "Resolved" } }`. Override the name with
`USERBACK_CLOSED_STATUS`, or set it to a numeric id to target a stage
by id instead of name:

```sh
export USERBACK_CLOSED_STATUS="Will Not Do"   # by name
export USERBACK_CLOSED_STATUS="9"             # by id
```

If your workspace uses a different terminal stage label, configure it
once and every subsequent `ub close` uses it.

See [ADR 0001](docs/adr/0001-close-via-workflow-stage.md) for the full
rationale.

## Output contract

- **Human mode (default):** success → stdout, errors → stderr.
- **JSON mode (`--json`):** success *and* errors → stdout as JSON. This
  lets `ub list --json | jq` handle failures without special-casing
  stderr. The exit code tells you whether to parse as success or as
  an error envelope.
- **Exit codes:** 0 success, 2 config, 3 unauthorized, 4 not found,
  5 validation, 6 other HTTP error, 7 network, 1 unexpected.

## Assumptions requiring verification

This MVP ships with a handful of API details inferred from incomplete
documentation. If you hit surprising behavior, these are the likely
causes:

- **Feedback response shape** — the human formatter renders `—` for
  any field the API omits, so unexpected fields don't break display.
- **Workflow stage by name** — `PATCH` accepts `Workflow.name`. If
  your workspace rejects it, set `USERBACK_CLOSED_STATUS` to the
  stage's numeric id.
- **OData filter syntax** — `list --type` and `--project-id` compose
  `eq` expressions with single-quoted strings. Adjust if the API
  returns 422 on filters.
- **429 / rate limits** — MVP does not retry; 429 exits 6.
- **Comment visibility** — `isPublic` is unset, so the API default
  applies.

Full design notes live in
[`docs/superpowers/specs/2026-04-18-userback-cli-mvp-design.md`](docs/superpowers/specs/2026-04-18-userback-cli-mvp-design.md).

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
./bin/ub.js --help
```

## Decisions

See [`docs/adr/`](docs/adr/) for decision records covering the stack
choice, output contract, packaging, and the close-via-workflow
mechanism.

## License

MIT. See [LICENSE](LICENSE).
