# CLI per-command split

## Problem

`src/cli.ts` is 345 lines and does five jobs at once: input validation, option types, per-command action implementations, Commander wiring, and top-level error reporting. Adding a new command means editing five sections of one file, and the shared validators are tangled with the action bodies.

## Goal

Split `cli.ts` so each command group (feedback, projects, comments) owns its own file, shared validators live in one place, shared types live in another, and `cli.ts` is reduced to program assembly plus top-level error plumbing. Preserve all current behavior and all current test coverage.

## Non-goals

- No new commands, flags, validators, or error kinds.
- No change to exit codes, stdout/stderr routing, or output formats.
- No change to the public `run(argv)` export or to `src/cli-entry.ts`.
- No existing file outside `src/cli.ts` is modified. The split only creates new files under `src/cli/` and shrinks `src/cli.ts` itself.

## Final layout

```text
src/
  cli-entry.ts                 (unchanged)
  cli.ts                       (~90 lines — program assembly + error reporting + run)
  cli/
    validate.ts                (~60 lines — validators, value constants, EXIT)
    types.ts                   (~20 lines — commander option types)
    commands/
      feedback.ts              (~130 lines — show/list/create/close actions + register)
      projects.ts              (~40 lines — projects list/show actions + register)
      comments.ts              (~20 lines — comment action + register)
```

## Module responsibilities

### `src/cli/validate.ts`

Runtime values only. Exports:

- Regex/set constants: `POSITIVE_INT_RE`, `FEEDBACK_TYPES`, `PRIORITIES`
- Tunable constants: `DEFAULT_CLOSED_STATUS`, `MAX_LIST_PAGE_SIZE`
- Exit-code map: `EXIT`
- Functions: `parsePositiveInt`, `validateFeedbackType`, `validatePriority`, `doubleSingleQuotes`, `buildCloseWorkflow`

No type-only exports. `EXIT` is a runtime constant consumed by `exitCodeFor` in `cli.ts` and by `closeAction` in `commands/feedback.ts`.

### `src/cli/types.ts`

Type-only. Exports `JsonOpt`, `ListOpts`, `CreateOpts`, `CloseOpts`, `CommentOpts`. Every export is a `type` alias — nothing runtime.

### `src/cli/commands/feedback.ts`

Owns the four feedback-item commands. Exports:

- `registerFeedback(program: Command): void` — attaches the `show`, `list`, `create`, and `close` subcommands to the passed program, with the same descriptions and options as today.

Internal (non-exported): `showAction`, `listAction`, `createAction`, `closeAction`. Keeps the `closeAction` behavior where a failed comment after a successful close writes to stdout/stderr and calls `process.exit(EXIT.HTTP)` directly.

### `src/cli/commands/projects.ts`

Exports `registerProjects(program: Command): void` — attaches the `projects` parent command with its `list` and `show` subcommands. Internal: `projectsListAction`, `projectsShowAction`.

### `src/cli/commands/comments.ts`

Exports `registerComments(program: Command): void` — attaches the top-level `comment <feedbackId>` command. Internal: `commentAction`.

### `src/cli.ts`

Public surface unchanged: `export async function run(argv: string[]): Promise<never>`.

Responsibilities:

- `buildProgram()` constructs the root `Command`, sets name/description/version/`showHelpAfterError`, and delegates to `registerFeedback(program)`, `registerProjects(program)`, `registerComments(program)`.
- `exitCodeFor(err)` maps error classes to `EXIT` values (imported from `./cli/validate.js`).
- `isJsonModeRequested(argv)` and `reportError(err, argv)` unchanged.
- `run(argv)` calls `loadDotenv()`, parses, and exits with the mapped code on failure — identical control flow to today.

## Import shape

- `cli.ts` imports from `./cli/validate.js` (for `EXIT`) and from each `./cli/commands/*.js` (for the `register*` functions). After the split, `cli.ts` no longer touches `./client.js` at module load — the error classes it needs for `exitCodeFor` (`UserbackError`, `HTTPError`, `ConfigError`, `NetworkError`, `UnauthorizedError`, `NotFoundError`, `ValidationError`, `ServerError`) move to `./errors.js` imports. Formatter imports narrow to `errorHuman` and `errorJson` — `errorPayload` travels with `closeAction` into `commands/feedback.ts`. It continues to import `loadDotenv` from `./env.js`.
- `cli/commands/*.ts` files import validators and `EXIT` from `../validate.js`, option types from `../types.js`, and reach up two levels for `../../client.js` and `../../formatter.js`.
- `cli/validate.ts` imports `ConfigError` from `../errors.js` directly (used by `parsePositiveInt` and the type/priority validators). Today `cli.ts` reaches those classes through `./client.js`, which re-exports them from `./errors.js`; the new files go to the source module instead of through the re-export, since they don't need anything else from `client.ts`.
- `cli/types.ts` has no runtime imports.

All existing dynamic `import("./client.js")` / `import("./formatter.js")` calls inside actions are kept — they become `import("../../client.js")` / `import("../../formatter.js")` from the new file locations. Keeping them dynamic preserves CLI startup time.

## Behavior preserved

- Same commands, same flags, same descriptions, same defaults.
- Same exit codes via the same `EXIT` map.
- Same stdout vs stderr routing, same JSON-vs-human branching.
- Same dotenv loading order (`run` still calls `loadDotenv()` first).
- `closeAction`'s partial-failure behavior (close succeeds, comment fails → exit `EXIT.HTTP` with stderr or JSON message) unchanged.
- `--json` detection in `reportError` still uses `argv.includes("--json")`.

## Tests

`test/cli.test.ts` spawns the built CLI binary, so it is indifferent to the internal layout. Every existing test should pass unchanged. No new tests are added as part of this refactor — the behavior is unchanged, and the existing end-to-end tests already cover it.

Verification after each step of the implementation:

1. `npm run typecheck` passes.
2. `npm test` passes, with the same 95 tests green.

## Migration order

The split is mechanical — no behavior change — and could land as one commit, but the suggested order below keeps every step green and makes review easier:

1. Create `src/cli/validate.ts` with validators + constants + `EXIT`. Update `cli.ts` to import from it. Typecheck + test.
2. Create `src/cli/types.ts` with option types. Update `cli.ts` to import from it. Typecheck + test.
3. Create `src/cli/commands/feedback.ts` with its four actions and `registerFeedback`. Update `cli.ts` to call it. Typecheck + test.
4. Create `src/cli/commands/projects.ts` likewise. Typecheck + test.
5. Create `src/cli/commands/comments.ts` likewise. Typecheck + test.
6. Final `cli.ts` shrinks to assembly + error reporting + `run`. Typecheck + test.

Each step leaves the CLI in a working state.

## Risks

- **Relative import paths.** Files moving from `src/` to `src/cli/commands/` need `../../client.js` and `../../formatter.js`. Typecheck will catch any missed ones.
- **Accidental behavior drift in `closeAction`.** It's the most branchy action. Moving it verbatim and running the existing cli tests is the safeguard.
- **Commander option parsing.** The `register*` functions must declare options with the same names, defaults, and descriptions. The cli tests exercise flag parsing end-to-end, which guards against drift.
