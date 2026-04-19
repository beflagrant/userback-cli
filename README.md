# userback-cli

[![CI](https://github.com/beflagrant/userback-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/beflagrant/userback-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/userback-cli.svg)](https://www.npmjs.com/package/userback-cli)
[![Node.js](https://img.shields.io/node/v/userback-cli.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A friendly command-line interface for the [Userback](https://userback.io) REST
API. List feedback, file bugs, post comments, and close items — all from your
terminal or a shell pipeline.

```sh
ub list --type Bug --limit 5
ub create --title "Checkout is broken" --body "500 on submit"
ub close 1234 --comment "Fixed in deploy 2026-04-19"
```

Every command supports `--json` for machine-readable output, exit codes are
stable per error class, and the binary is small enough to drop into CI or an
LLM-driven agent workflow.

> **Status: early.** `userback-cli` is `0.1.0`, pre-first-release. The
> command set is intentionally small and the output contract is stable
> (see [ADR 0003](docs/adr/0003-output-stream-contract.md)), but expect
> additive changes before `1.0`. Bug reports and feature requests during
> this window directly shape the `1.0` surface — please
> [open an issue](https://github.com/beflagrant/userback-cli/issues/new/choose).

## Table of contents

- [Quick start](#quick-start)
- [Installation](#installation)
- [Authentication](#authentication)
- [Commands](#commands)
- [Examples](#examples)
- [JSON mode and exit codes](#json-mode-and-exit-codes)
- [How `ub close` works](#how-ub-close-works)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Design decisions](#design-decisions)
- [Contributing](#contributing)
- [License](#license)

## Quick start

```sh
# 1. Install
npm install -g userback-cli

# 2. Point it at your Userback workspace
export USERBACK_API_KEY="ub_..."          # from Workspace Settings → API Tokens
export USERBACK_DEFAULT_PROJECT_ID="123"  # your numeric project id
export USERBACK_DEFAULT_EMAIL="you@example.com"

# 3. Try it
ub list --limit 5
```

That's it — you should see the five most recent feedback items from your
workspace, formatted as a table. If something goes wrong, see
[Troubleshooting](#troubleshooting).

## Installation

### Requirements

- **Node.js 24 or later** (check with `node --version`). If you need to manage
  multiple Node versions, [`nvm`](https://github.com/nvm-sh/nvm) is a good
  choice.

### Install globally (recommended)

```sh
npm install -g userback-cli
ub --version
```

### Install per-project

```sh
npm install --save-dev userback-cli
npx ub --help
```

### Run without installing

```sh
npx userback-cli --help
```

## Authentication

`userback-cli` reads all credentials from environment variables so nothing
sensitive is ever stored on disk by the tool itself.

| Variable | Required | Purpose |
|---|---|---|
| `USERBACK_API_KEY` | **Yes** | Bearer token from Workspace Settings → API Tokens. |
| `USERBACK_DEFAULT_PROJECT_ID` | For `ub create` (unless `--project-id` passed) | Numeric project id. |
| `USERBACK_DEFAULT_EMAIL` | For `ub create` (unless `--email` passed) | Submitter email on new items. |
| `USERBACK_BASE_URL` | No | Override the API base URL. Defaults to `https://rest.userback.io/1.0`. |
| `USERBACK_CLOSED_STATUS` | No | Workflow stage name (or numeric id) for `ub close`. Defaults to `"Resolved"`, the terminal stage of the default Userback workflow. |
| `UB_DEBUG` | No | Set to `1` to include stack traces on unexpected errors. |

### Getting your API key

1. Open your Userback workspace.
2. Go to **Workspace Settings → API Tokens**.
3. Generate a new token and copy it into `USERBACK_API_KEY`.

### Tip: use a `.env` file

`ub` loads a `.env` file from the current directory automatically, so
you can keep credentials out of your shell profile:

```sh
# .env
USERBACK_API_KEY=ub_...
USERBACK_DEFAULT_PROJECT_ID=123
USERBACK_DEFAULT_EMAIL=you@example.com
```

Any `KEY=value` lines are loaded into `process.env`. Lines beginning
with `#` are treated as comments. Values wrapped in single or double
quotes have the outer quotes stripped. **Real environment variables
always win** — if you set `USERBACK_API_KEY` in your shell, the `.env`
value is ignored.

Add `.env` to your `.gitignore`. For ad-hoc one-offs, the inline form
still works:

```sh
USERBACK_API_KEY="ub_..." ub list --limit 1
```

## Commands

```text
ub list         [--json] [--limit N] [--type Bug|Idea|General] [--project-id ID] [--status NAME]
ub show         <id> [--json]
ub create       --title "..." --body "..." [--type ...] [--priority low|neutral|high|urgent]
                [--project-id ID] [--email E] [--json]
ub close        <id> [--comment "..."] [--json]
ub comment      <id> --body "..." [--json]
ub projects list [--json]
ub projects show <id> [--json]
```

Run `ub <command> --help` for the canonical list of flags for each command.

## Examples

### Discover your projects

```sh
ub projects list
ub projects show 139657
```

Use this to find the right `USERBACK_DEFAULT_PROJECT_ID` when you're
setting up `ub create`.

### List recent bugs, formatted as a table

```sh
ub list --type Bug --limit 10
```

### Pipe everything into `jq`

```sh
ub list --json | jq '.[] | {id, title, priority}'
```

### File a new bug

```sh
ub create \
  --title "Checkout returns 500" \
  --body "Repro: add item, click Pay, see spinner forever" \
  --type Bug \
  --priority high
```

### Close with a resolution note

```sh
ub close 1234 --comment "Fixed in deploy 2026-04-19"
```

More patterns — filtering by workflow stage, viewing a single item,
commenting, bulk-closing, nightly exports, CI integration —
live in [docs/recipes.md](docs/recipes.md) and
[docs/ci-examples.md](docs/ci-examples.md).

## JSON mode and exit codes

The CLI has a stable output contract so it's safe to script against.

### Streams

- **Human mode (default):** success → `stdout`, errors → `stderr`.
- **JSON mode (`--json`):** success *and* errors → `stdout`, as JSON. This
  lets pipelines like `ub list --json | jq` handle failures without
  special-casing `stderr`. The exit code tells you whether to parse the
  payload as a success response or as an error envelope.

### Error envelope

In JSON mode, failures look like:

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

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Unexpected error |
| `2` | Configuration error (missing env var, bad flag) |
| `3` | Unauthorized (`401`) |
| `4` | Not found (`404`) |
| `5` | Validation (`422`) |
| `6` | Other HTTP error (including rate limits) |
| `7` | Network / transport error |

In shell:

```sh
if ub show 1234 --json > item.json; then
  echo "Got it"
else
  case $? in
    4) echo "No such feedback" ;;
    3) echo "Token rejected" ;;
    *) echo "Something else went wrong" ;;
  esac
fi
```

## How `ub close` works

The Userback API has no standalone "status" field. Closing a feedback item
means PATCHing its `Workflow` to a terminal stage. By default, `ub close`
sends:

```json
{ "Workflow": { "name": "Resolved" } }
```

If your workspace uses a different label (or you prefer targeting stages by
id), set `USERBACK_CLOSED_STATUS`:

```sh
export USERBACK_CLOSED_STATUS="Will Not Do"   # by name
export USERBACK_CLOSED_STATUS="9"             # by id (numeric string)
```

The full rationale lives in
[ADR 0001](docs/adr/0001-close-via-workflow-stage.md).

## Troubleshooting

### `ub: config: USERBACK_API_KEY is required`

Set `USERBACK_API_KEY` in your shell (see [Authentication](#authentication)).

### `ub: validation: HTTP 422: {"message":"Workflow not found"}` when closing

Your workspace's workflow doesn't have a stage named `Resolved`. Find the
real terminal stage name (visible on the Status Board) and set it:

```sh
export USERBACK_CLOSED_STATUS="Done"
```

### `ub: unauthorized: HTTP 401`

Your token is missing, expired, or scoped incorrectly. Regenerate it in
Workspace Settings → API Tokens.

### `ub: network: ...`

DNS, proxy, or TLS failure reaching `rest.userback.io`. Re-run with
`UB_DEBUG=1` for a stack trace.

### Something else

Re-run with `UB_DEBUG=1` to include a stack trace, or open an issue with
the failing command and the full output.

## Development

```sh
git clone https://github.com/beflagrant/userback-cli
cd userback-cli
npm install

npm test          # run the full test suite
npm run typecheck # tsc --noEmit
npm run build     # emit dist/ for publishing
./bin/ub.js --help
```

The test suite covers both the HTTP client (via `undici`'s `MockAgent`) and
the CLI as a whole (by spawning `./bin/ub.js` against a local `node:http`
server). No live API calls are made.

### Project layout

```text
src/
  cli.ts         # Commander wiring and argument parsing
  client.ts      # HTTP client + typed error hierarchy
  formatter.ts   # human / JSON output formatters
bin/ub.js        # shebang stub that imports dist/cli.js
test/            # node:test specs mirroring src/
docs/
  adr/           # architecture decision records
  superpowers/   # design notes and plans
```

## Design decisions

Significant choices are captured as lightweight ADRs in
[`docs/adr/`](docs/adr/): the stack choice, the output contract, the
publishing model, and the close-via-workflow mechanism. Start there if
you're curious *why* something works the way it does before suggesting a
change.

## Contributing

Contributions are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes, run the
test suite, and structure a PR. For anything larger than a typo, please
open an issue first so we can agree on scope.

Security issues: do **not** open a public issue; see
[SECURITY.md](SECURITY.md) for the disclosure path.

## License

[MIT](LICENSE) © Flagrant
