# `userback-cli` (binary `ub`) — MVP Design

**Date:** 2026-04-18
**Status:** Approved (pending user review of this spec)

## Goal

Build a Node/TypeScript command-line tool published to npm as
`userback-cli` and invoked as `ub`. It wraps the Userback REST
API with five subcommands: `list`, `show`, `create`, `close`,
and `comment`. The primary consumer is an LLM agent invoking
the CLI in a shell; a human using the terminal is a secondary
consumer. The MVP is small, explicit, strictly a CLI (no
programmatic API surface), and shell-scripting-friendly.

This is a platform port of the design originally written for the
sibling Ruby project at `/Users/jim/code/userback-ruby`. Product
decisions (endpoints, commands, env vars, stream contract,
close-via-workflow) carry over unchanged. Only ecosystem choices
are fresh.

## Non-goals

- Full coverage of the Userback API. Only the verbs named above.
- Programmatic library API (`import { Client } from 'userback-cli'`).
  Strictly a CLI. Reserve this option for a future version.
- Retry logic, rate-limit backoff, connection pooling.
- Interactive TUI or web UI.
- A `.ubrc` config file. Environment variables only.
- Offline caching of feedback data.
- Authentication flows beyond a static API token.
- CommonJS build; Node < 24 support.

## Userback API endpoints used

Base URL: `https://rest.userback.io/1.0`
Auth: `Authorization: Bearer <USERBACK_API_KEY>` header on every
request.

| CLI command | HTTP | Path | Notes |
|---|---|---|---|
| `ub list` | GET | `/feedback` | Query params: `page`, `limit` (max 50), `sort`, `filter` (OData). |
| `ub show ID` | GET | `/feedback/{id}` | Passthrough of response. |
| `ub create` | POST | `/feedback` | Body requires `projectId`, `email`, `feedbackType`, `title`, `description`. Optional `priority`. |
| `ub close ID` | PATCH | `/feedback/{id}` | Body `{"Workflow": {"name": <configured>}}`. See ADR 0001. |
| `ub comment ID` | POST | `/feedback/comment` | Body `{"feedbackId": <id>, "comment": "..."}`. Feedback id in body, not path. |

Supporting ADRs:

- [0001 — close via workflow stage](../../adr/0001-close-via-workflow-stage.md)
- [0002 — stack (ESM + TypeScript + Commander + native fetch)](../../adr/0002-esm-typescript-commander-fetch.md)
- [0003 — output stream contract](../../adr/0003-output-stream-contract.md)
- [0004 — package name + binary + publish shape](../../adr/0004-package-name-and-publish-shape.md)

## Architecture

Four source files, one bin stub. Each file has one job.

```
bin/ub.js                 # plain-JS shebang stub (ESM); dynamic-imports dist/cli.js
src/cli.ts                # Commander program; action handlers; exit-code mapping
src/client.ts             # UserbackClient + Error hierarchy; single fetch wrapper
src/formatter.ts          # Pure functions: value → string (human or JSON)
dist/                     # tsc output; gitignored; shipped on publish
test/
  helpers/mock-agent.ts   # MockAgent setup/teardown helper
  formatter.test.ts
  client.test.ts
  cli.test.ts
tsconfig.json
package.json
README.md
docs/adr/...
docs/superpowers/specs/...
```

The top-level runtime export is the Commander `program` instance's
`run(argv)` function, called from `bin/ub.js`. No `src/index.ts` —
per ADR 0004, no programmatic API in MVP.

### Responsibilities

**`bin/ub.js`** (plain JavaScript, ESM)

- Shebang `#!/usr/bin/env node`. Executable bit set.
- Two statements: dynamic `import('../dist/cli.js')` and
  `mod.run(process.argv)`. Plain JS so it boots under `node` with
  no TS toolchain.

**`src/cli.ts`**

- Exports `run(argv: string[]): Promise<never>`.
- Builds the Commander `program` once; one `.command('<verb>')`
  per subcommand with `.option(...)` and `.action(...)` blocks.
- Action handlers: read env + flag options, validate (throwing
  `ConfigError` on missing required inputs), instantiate
  `UserbackClient`, call the verb, hand the result to
  `Formatter.*`, write to stdout/stderr, `process.exit(N)`.
- One top-level `try/catch` around the whole dispatch translates
  `UserbackError` subclasses into exit codes per ADR 0003.
- No HTTP logic and no formatting logic lives here.

**`src/client.ts`**

- Exports the `UserbackClient` class, the `UserbackError` base,
  and the typed subclasses (`ConfigError`, `NetworkError`,
  `HTTPError`, `UnauthorizedError`, `NotFoundError`,
  `ValidationError`, `ServerError`).
- Constructor takes no arguments; reads `USERBACK_API_KEY` and
  `USERBACK_BASE_URL` from `process.env`. Throws `ConfigError`
  if API key missing.
- Methods:
  - `listFeedback(opts: ListOptions): Promise<Feedback[]>`
  - `getFeedback(id: number): Promise<Feedback>`
  - `createFeedback(attrs: CreateFeedbackAttrs): Promise<Feedback>`
  - `updateFeedback(id: number, attrs: UpdateFeedbackAttrs): Promise<Feedback>`
  - `createComment(args: { feedbackId: number; comment: string }): Promise<Comment>`
- Private `request<T>(method, path, { body?, query? })` helper:
  - Builds `Request` via `new URL` + URL-encoded query.
  - Sets `Authorization: Bearer $KEY` and
    `Content-Type: application/json`.
  - Calls `fetch`. `try/catch` converts thrown errors
    (`TypeError` from network; `DOMException: AbortError`) to
    `NetworkError`.
  - On `!response.ok`, reads body (JSON if parseable, else text),
    switches on status, throws the matching `HTTPError` subclass.
  - On success, returns `await response.json() as T`.
- No dependency on Commander or Formatter.

**`src/formatter.ts`**

- Exports pure functions; no state.
- `feedbackListHuman(rows: Feedback[]): string` — fixed-width
  columns (id, type, title, priority, created). Missing fields
  render as `—` so unexpected response shapes don't crash.
- `feedbackListJson(rows: Feedback[]): string` —
  `JSON.stringify(rows) + '\n'`.
- `feedbackHuman(row: Feedback): string` — readable block,
  key fields.
- `feedbackJson(row: Feedback): string` —
  `JSON.stringify(row) + '\n'`.
- `createdIdHuman(row: Feedback): string` — just the id on one
  line.
- `errorHuman(err: UserbackError): string` —
  `` `ub: ${err.kind}: ${err.message}` ``.
- `errorJson(err: UserbackError): string` —
  `JSON.stringify({ error: { kind, message, status?, body? } }) + '\n'`.

### TypeScript types

Types are declared in `client.ts` alongside the client methods
that consume them. Kept permissive at the boundary because the
Userback API docs don't fully enumerate response fields:

```ts
interface Feedback {
  id: number;
  projectId?: number;
  feedbackType?: string;
  title?: string;
  description?: string;
  priority?: string;
  category?: string;
  rating?: string;
  createdAt?: string;
  // everything else we don't read but want to preserve in JSON mode
  [key: string]: unknown;
}
```

The index signature makes the JSON formatter a trivial passthrough
while the structural fields give the human formatter something to
render.

## Data flow (per command)

```
process.argv → Commander parses → action handler receives (opts, args)
                                         │
                                         ▼
                                  UserbackClient.<verb>
                                         │
                                         ▼
                                  fetch() → Response
                                         │
                                         ▼
                              2xx: parsed JSON (typed)
                              non-2xx: thrown UserbackError
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
                success                                     error
                formatter.<verb><Mode>(data)                translate class → exit code
                → process.stdout.write(...)                 formatter.error<Mode>(err)
                process.exit(0)                             → stdout (JSON) or stderr (human)
                                                            process.exit(N)
```

### Per-command specifics

**`ub list [--json] [--limit N] [--status S] [--project-id ID] [--type T]`**

- `--limit` defaults to 25, max 50. Values above 50 are clamped
  with a stderr warning in human mode; silently clamped in JSON
  mode.
- Filters compose into an OData string:
  `projectId eq 123 and feedbackType eq 'Bug'`. If no filter
  flags are passed, no `filter` query param is sent.
- No multi-page support in MVP. One page per invocation.
- `--status` maps to the feedback's workflow stage name. Exact
  OData syntax is flagged in "Assumptions requiring verification."

**`ub show FEEDBACK_ID [--json]`**

- `FEEDBACK_ID` must parse to a positive integer; invalid values
  throw `ConfigError` before any HTTP call.

**`ub create --title T --body B [--type T] [--project-id ID] [--priority P] [--email E] [--json]`**

- `--title` and `--body` declared `.requiredOption()`.
- `--project-id` flag overrides `USERBACK_DEFAULT_PROJECT_ID`;
  throws `ConfigError` if neither set.
- `--email` flag overrides `USERBACK_DEFAULT_EMAIL`;
  throws `ConfigError` if neither set.
- `--type` defaults to `"General"`; validated against
  `General|Bug|Idea`.
- `--priority` validated against `low|neutral|high|urgent` when
  provided.
- `--body` maps to `description` in the request body.
- Human mode prints only the new feedback's id on one line.
  JSON mode prints the full response.

**`ub close FEEDBACK_ID [--comment C] [--json]`**

- PATCH body construction:
  - If `process.env.USERBACK_CLOSED_STATUS` matches `/^\d+$/` →
    `{ Workflow: { id: Number(v) } }`.
  - Otherwise →
    `{ Workflow: { name: process.env.USERBACK_CLOSED_STATUS ?? 'Closed' } }`.
- With `--comment`: PATCH first, then POST comment on PATCH
  success. PATCH failure never triggers the comment call.
  PATCH success + comment failure → exit 6 with partial-success
  output. Human: both lines on stderr. JSON:
  `{ "closed": true, "comment": { "error": { ... } } }` on stdout.

**`ub comment FEEDBACK_ID --body B [--json]`**

- Single POST to `/feedback/comment` with
  `{ feedbackId, comment }`.

## Error handling

Per ADR 0003. Hierarchy in `src/client.ts`:

```
UserbackError
├── ConfigError
├── NetworkError
└── HTTPError         (status: number, body: unknown)
    ├── UnauthorizedError   // 401
    ├── NotFoundError       // 404
    ├── ValidationError     // 422
    └── ServerError         // 5xx
```

Exit-code table is in ADR 0003.

Unexpected JS errors (not `UserbackError`) are caught at the top
level of `run()`, exit 1, stack printed only if `UB_DEBUG=1`.

## Configuration

All via environment variables.

| Var | Required | Purpose |
|---|---|---|
| `USERBACK_API_KEY` | Yes | Bearer token. |
| `USERBACK_BASE_URL` | No | Defaults to `https://rest.userback.io/1.0`. Override for tests or staging. |
| `USERBACK_DEFAULT_PROJECT_ID` | Required unless `--project-id` passed | Numeric project id. |
| `USERBACK_DEFAULT_EMAIL` | Required unless `--email` passed | Submitter email for `ub create`. |
| `USERBACK_CLOSED_STATUS` | No | Workflow stage name for `ub close`. Defaults to `"Closed"`. Numeric value is treated as id. |
| `UB_DEBUG` | No | `1` enables stack traces on unexpected exceptions. |

## Testing

Runner: `node:test` (stdlib). HTTP mocking: `undici`'s `MockAgent`
(dev dep). TS executed via `tsx`.

```
test/
├── helpers/
│   └── mock-agent.ts      # installGlobalMockAgent(), restore(), stub(path, fn)
├── formatter.test.ts      # pure-function coverage
├── client.test.ts         # one success + one error per verb
└── cli.test.ts            # subprocess tests via child_process.spawn
```

- **Formatter (~8 tests):** one per exported function. JSON
  formatters additionally assert `JSON.parse(output)` round-trips.
- **Client (~10 tests):** per verb, assert request shape (method,
  URL, headers including `Authorization: Bearer`, body) against
  the MockAgent intercept; one failure case per verb mapping
  401/404/422 to the correct subclass.
- **CLI (~7 tests):** spawn
  `node --import tsx bin/ub.js <cmd>` with
  `USERBACK_BASE_URL` pointed at the MockAgent host; assert exit
  code + stdout + stderr for happy path of each subcommand, plus
  one `--json` mode test and one 404 error-path test.

Scripts:

```json
"scripts": {
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "test": "node --import tsx --test test/**/*.test.ts",
  "test:watch": "node --import tsx --test --watch test/**/*.test.ts",
  "prepublishOnly": "npm run typecheck && npm test && npm run build"
}
```

## Packaging

Per ADR 0004.

```
package.json:
  name: "userback-cli"
  type: "module"
  bin: { "ub": "./bin/ub.js" }
  # no "exports" field — strictly a CLI, no programmatic API (ADR 0004)
  files: ["dist/", "bin/", "README.md", "LICENSE"]
  engines: { "node": ">=24" }
  dependencies: { "commander": "^12" }
  devDependencies:
    "typescript": "^5"
    "tsx": "^4"
    "undici": "^6"
    "@types/node": "^24"
```

`tsconfig.json` targets `ES2023`, `moduleResolution: NodeNext`,
`module: NodeNext`, `outDir: dist`, `declaration: true`,
`strict: true`.

`.gitignore`: `node_modules/`, `dist/`.

## README contents

1. One-paragraph what/why.
2. Install: `npm i -g userback-cli`, then `ub --help`. Mention
   the package-name/binary-name split explicitly.
3. Environment variables with one-line descriptions.
4. Example commands:
   - `ub list --json | jq`
   - `ub create --title "Bug in checkout" --body "500 on submit"`
   - `ub close 123 --comment "Fixed in deploy 2026-04-18"`
   - one `ub show` example
   - one `ub comment` example
5. "How `close` works" section — brief summary of ADR 0001,
   `USERBACK_CLOSED_STATUS` override, numeric-id escape hatch.
6. "Assumptions requiring verification" section (below).
7. Link to `docs/adr/` for decision rationale.

## Assumptions requiring verification

Items proceeded with but not fully confirmed by the Userback docs:

1. **Feedback response shape.** The API reference pages for
   `GET /feedback` and `GET /feedback/{id}` don't enumerate
   response fields in the excerpts fetched. Assuming standard
   Userback fields (id, projectId, feedbackType, title,
   description, priority, category, rating, createdAt, etc.).
   The formatter renders `—` for missing keys so an unexpected
   shape won't crash the CLI.
2. **Workflow stage PATCH acceptance.** Assuming that
   `{ "Workflow": { "name": "Closed" } }` sent to
   `PATCH /feedback/{id}` advances the feedback to that stage.
   The docs describe the `Workflow` field as "Workflow reference
   (id or name; at least one required)" but don't document exact
   success semantics. Numeric id via `USERBACK_CLOSED_STATUS` is
   the documented fallback.
3. **OData filter syntax.** The `filter` param is documented as
   "odata filter syntax" without examples. Assuming `eq` with
   single-quoted strings works for `feedbackType`,
   workflow-stage name (for `--status`), and numeric `projectId`.
   Client accepts a raw filter string, so adjustments are
   CLI-layer only.
4. **Rate limits / 429 handling.** The API declares a 429
   response code but documents no retry-after header or limit.
   MVP doesn't retry; 429 bubbles up as `HTTPError` (exit 6).
5. **Comment visibility.** `POST /feedback/comment` accepts
   `isPublic`. MVP doesn't set it; Userback's default applies.
   If the default is wrong for the primary user, a follow-up
   can add `--private`.
6. **Workflow stage shape in responses.** `feedbackListHuman`
   plans to show a workflow indicator (so you can tell what's
   closed). If the `GET /feedback` response doesn't include the
   current workflow stage inline, the human formatter either
   omits it or needs a second call per row (which we won't do in
   MVP). If the field is missing, human mode just omits it.

## Out of scope (for later)

- Pagination across multiple pages of `list`.
- Bulk operations (`ub close ID1 ID2 ID3`).
- Attachments on `create` (multipart).
- Listing comments or replies to comments.
- `ub projects` / `ub workflows` discovery subcommands.
- Programmatic `import { UserbackClient } from 'userback-cli'`.
  Wiring this is a single-file change if it becomes useful.
