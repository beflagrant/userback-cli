# CLI per-command split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `src/cli.ts` (345 lines, doing five jobs) into a small group of focused modules — shared validators, shared types, per-command-group files — so `cli.ts` itself becomes just program assembly and top-level error plumbing.

**Architecture:** New directory `src/cli/` holds `validate.ts` (runtime helpers + `EXIT`), `types.ts` (option types only), and `commands/{feedback,projects,comments}.ts`. Each command file exports a `register(program)` function that owns both the Commander wiring and the action bodies for its group. `cli.ts` imports those `register*` functions plus `EXIT` and composes the program. No behavior changes; existing end-to-end tests in `test/cli.test.ts` cover the surface.

**Tech Stack:** TypeScript (ESM, NodeNext), Commander, `node:test` runner, `tsx` loader, npm scripts (`build`, `typecheck`, `test`).

**Spec:** `docs/superpowers/specs/2026-04-21-cli-per-command-split-design.md`

---

## Conventions used throughout this plan

- **ESM extensions.** All relative imports use `.js` suffix even though source files are `.ts` — the `tsconfig.json` has `"moduleResolution": "NodeNext"`. Keep doing this.
- **Dynamic imports stay dynamic.** Actions do `await import("../../client.js")` and `await import("../../formatter.js")` on-call, to keep CLI startup snappy. Don't hoist them.
- **Verification command pair.** After every source-touching step: `npm run -s typecheck` (expect `ok`) and `npm test --silent 2>&1 | tail -4` (expect `tests 95`, `pass 95`, `fail 0`).
- **Git is raw git (not `but`).** The user explicitly prefers raw git for this branch.
- **Branch:** work stays on `code-review`. Each task is a single commit pushed to the same PR (#2).

---

## Task 1: Extract validators, value constants, and EXIT into `src/cli/validate.ts`

**Files:**

- Create: `src/cli/validate.ts`
- Modify: `src/cli.ts` (remove the extracted declarations, import them instead)

**What moves:** `POSITIVE_INT_RE`, `FEEDBACK_TYPES`, `PRIORITIES`, `DEFAULT_CLOSED_STATUS`, `MAX_LIST_PAGE_SIZE`, `EXIT`, `parsePositiveInt`, `validateFeedbackType`, `validatePriority`, `doubleSingleQuotes`, `buildCloseWorkflow`.

- [ ] **Step 1: Create `src/cli/validate.ts` with all validators and constants**

Create the file with this exact content:

```ts
import { ConfigError } from "../errors.js";

export const POSITIVE_INT_RE = /^\d+$/;
export const FEEDBACK_TYPES = new Set(["General", "Bug", "Idea"]);
export const PRIORITIES = new Set(["low", "neutral", "high", "urgent"]);
export const DEFAULT_CLOSED_STATUS = "Resolved";
export const MAX_LIST_PAGE_SIZE = 50;

export const EXIT = {
  SUCCESS: 0,
  UNEXPECTED: 1,
  CONFIG: 2,
  UNAUTHORIZED: 3,
  NOT_FOUND: 4,
  VALIDATION: 5,
  HTTP: 6,
  NETWORK: 7,
} as const;

export function parsePositiveInt(raw: string, name: string): number {
  if (!POSITIVE_INT_RE.test(raw)) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  return n;
}

export function validateFeedbackType(t: string): void {
  if (!FEEDBACK_TYPES.has(t)) {
    throw new ConfigError(`--type must be one of General|Bug|Idea, got: ${t}`);
  }
}

export function validatePriority(p: string): void {
  if (!PRIORITIES.has(p)) {
    throw new ConfigError(`--priority must be one of low|neutral|high|urgent, got: ${p}`);
  }
}

export function doubleSingleQuotes(s: string): string {
  return s.replaceAll("'", "''");
}

export function buildCloseWorkflow(): { id: number } | { name: string } {
  const raw = process.env.USERBACK_CLOSED_STATUS;
  if (raw !== undefined && POSITIVE_INT_RE.test(raw)) {
    return { id: Number(raw) };
  }
  return { name: raw ?? DEFAULT_CLOSED_STATUS };
}
```

Notes:

- `ConfigError` is imported from `../errors.js` (not `../client.js`) per the spec.
- The comparison paths — regex source, set membership, `Number.isSafeInteger`, `<= 0` — match `src/cli.ts` lines 10-60 verbatim.

- [ ] **Step 2: Update `src/cli.ts` to import from `./cli/validate.js`**

In `src/cli.ts`:

a) Remove lines 10-25 (the `POSITIVE_INT_RE`, `FEEDBACK_TYPES`, `PRIORITIES`, `DEFAULT_CLOSED_STATUS`, `MAX_LIST_PAGE_SIZE`, and `EXIT` declarations).

b) Remove lines 27-60 (the `parsePositiveInt`, `validateFeedbackType`, `validatePriority`, `doubleSingleQuotes`, `buildCloseWorkflow` function definitions).

c) Add this import near the top of the file, after the existing imports:

```ts
import {
  POSITIVE_INT_RE,
  MAX_LIST_PAGE_SIZE,
  EXIT,
  parsePositiveInt,
  validateFeedbackType,
  validatePriority,
  doubleSingleQuotes,
  buildCloseWorkflow,
} from "./cli/validate.js";
```

Notes:

- `POSITIVE_INT_RE` stays imported because `buildCloseWorkflow` is now in `validate.ts` — but do not remove the import if `cli.ts` itself still references `POSITIVE_INT_RE` anywhere. Grep before finishing: `grep -n "POSITIVE_INT_RE\|FEEDBACK_TYPES\|PRIORITIES\|DEFAULT_CLOSED_STATUS" src/cli.ts` should return no matches after this edit. If it does, drop those names from the import list.
- `FEEDBACK_TYPES`, `PRIORITIES`, and `DEFAULT_CLOSED_STATUS` are only used inside validators / `buildCloseWorkflow`, all of which are now in `validate.ts`, so `cli.ts` no longer needs them.

- [ ] **Step 3: Verify typecheck and tests pass**

```bash
npm run -s typecheck
```

Expected: `ok`

```bash
npm test --silent 2>&1 | tail -4
```

Expected output includes:

```text
ℹ tests 95
ℹ pass 95
ℹ fail 0
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/validate.ts src/cli.ts
git commit -m "$(cat <<'EOF'
Extract CLI validators and EXIT into src/cli/validate.ts

First step in breaking src/cli.ts apart: moves the shared input
validators, value-shape constants, and the EXIT code map into their
own module. cli.ts imports them back; behavior is unchanged.
EOF
)"
git push
```

---

## Task 2: Extract Commander option types into `src/cli/types.ts`

**Files:**

- Create: `src/cli/types.ts`
- Modify: `src/cli.ts` (remove the type aliases, import them instead)

**What moves:** `JsonOpt`, `ListOpts`, `CreateOpts`, `CloseOpts`, `CommentOpts`.

- [ ] **Step 1: Create `src/cli/types.ts`**

```ts
export type JsonOpt = { json?: boolean };

export type ListOpts = JsonOpt & {
  limit: string;
  status?: string;
  projectId?: string;
  type?: string;
};

export type CreateOpts = JsonOpt & {
  title: string;
  body: string;
  type: string;
  projectId?: string;
  priority?: string;
  email?: string;
};

export type CloseOpts = JsonOpt & { comment?: string };

export type CommentOpts = JsonOpt & { body: string };
```

Notes:

- Every export is a `type` alias — nothing runtime. The file contains no `import` and no value-level code.

- [ ] **Step 2: Update `src/cli.ts` to import these types**

In `src/cli.ts`:

a) Remove the five `type` alias declarations that used to be on lines 62-82 (`JsonOpt`, `ListOpts`, `CreateOpts`, `CloseOpts`, `CommentOpts`).

b) Add this import near the top, after the existing imports:

```ts
import type {
  JsonOpt,
  ListOpts,
  CreateOpts,
  CloseOpts,
  CommentOpts,
} from "./cli/types.js";
```

Use `import type` — these are type-only.

- [ ] **Step 3: Verify typecheck and tests pass**

```bash
npm run -s typecheck
```

Expected: `ok`

```bash
npm test --silent 2>&1 | tail -4
```

Expected: `tests 95`, `pass 95`, `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/cli/types.ts src/cli.ts
git commit -m "$(cat <<'EOF'
Extract CLI option types into src/cli/types.ts

Pulls the JsonOpt/ListOpts/CreateOpts/CloseOpts/CommentOpts type
aliases out of cli.ts into a type-only module so per-command files
can import them without pulling runtime deps along.
EOF
)"
git push
```

---

## Task 3: Move feedback actions into `src/cli/commands/feedback.ts`

**Files:**

- Create: `src/cli/commands/feedback.ts`
- Modify: `src/cli.ts` (remove the four action functions and their subcommand wiring; call `registerFeedback` from `buildProgram`)

**What moves:** `showAction`, `listAction`, `createAction`, `closeAction`, plus the `show`/`list`/`create`/`close` blocks inside `buildProgram`.

- [ ] **Step 1: Create `src/cli/commands/feedback.ts`**

```ts
import type { Command } from "commander";
import {
  EXIT,
  MAX_LIST_PAGE_SIZE,
  buildCloseWorkflow,
  doubleSingleQuotes,
  parsePositiveInt,
  validateFeedbackType,
  validatePriority,
} from "../validate.js";
import type { JsonOpt, ListOpts, CreateOpts, CloseOpts } from "../types.js";
import { ConfigError } from "../../errors.js";

async function showAction(feedbackIdRaw: string, opts: JsonOpt): Promise<void> {
  const id = parsePositiveInt(feedbackIdRaw, "feedbackId");
  const { UserbackClient } = await import("../../client.js");
  const { feedbackHuman, feedbackJson } = await import("../../formatter.js");
  const client = new UserbackClient();
  const row = await client.getFeedback(id);
  const output = opts.json ? feedbackJson(row) : feedbackHuman(row);
  process.stdout.write(output);
}

async function listAction(opts: ListOpts): Promise<void> {
  const requested = parsePositiveInt(opts.limit, "--limit");
  let limit = requested;
  if (limit > MAX_LIST_PAGE_SIZE) {
    limit = MAX_LIST_PAGE_SIZE;
    if (!opts.json) {
      process.stderr.write(`ub: --limit clamped to API max of ${MAX_LIST_PAGE_SIZE}\n`);
    }
  }

  const filters: string[] = [];
  if (opts.projectId) {
    const pid = parsePositiveInt(opts.projectId, "--project-id");
    filters.push(`projectId eq ${pid}`);
  }
  if (opts.type) {
    validateFeedbackType(opts.type);
    filters.push(`feedbackType eq '${opts.type}'`);
  }
  if (opts.status) {
    filters.push(`Workflow/name eq '${doubleSingleQuotes(opts.status)}'`);
  }
  const filter = filters.length > 0 ? filters.join(" and ") : undefined;

  const { UserbackClient } = await import("../../client.js");
  const { feedbackListHuman, feedbackListJson } = await import("../../formatter.js");
  const client = new UserbackClient();
  const rows = await client.listFeedback({ limit, filter });
  const output = opts.json ? feedbackListJson(rows) : feedbackListHuman(rows);
  process.stdout.write(output);
}

async function createAction(opts: CreateOpts): Promise<void> {
  validateFeedbackType(opts.type);
  const projectIdRaw = opts.projectId ?? process.env.USERBACK_DEFAULT_PROJECT_ID;
  if (!projectIdRaw) {
    throw new ConfigError("--project-id or USERBACK_DEFAULT_PROJECT_ID is required");
  }
  const projectId = parsePositiveInt(projectIdRaw, "project-id");
  const email = opts.email ?? process.env.USERBACK_DEFAULT_EMAIL;
  if (!email) {
    throw new ConfigError("--email or USERBACK_DEFAULT_EMAIL is required");
  }
  if (opts.priority !== undefined) {
    validatePriority(opts.priority);
  }

  const { UserbackClient } = await import("../../client.js");
  const { feedbackJson, createdIdHuman } = await import("../../formatter.js");
  const client = new UserbackClient();
  const created = await client.createFeedback({
    projectId,
    email,
    feedbackType: opts.type as "General" | "Bug" | "Idea",
    title: opts.title,
    description: opts.body,
    priority: opts.priority as "low" | "neutral" | "high" | "urgent" | undefined,
  });
  const output = opts.json ? feedbackJson(created) : createdIdHuman(created);
  process.stdout.write(output);
}

async function closeAction(feedbackIdRaw: string, opts: CloseOpts): Promise<void> {
  const id = parsePositiveInt(feedbackIdRaw, "feedbackId");
  const workflow = buildCloseWorkflow();

  const { UserbackClient } = await import("../../client.js");
  const { errorPayload } = await import("../../formatter.js");
  const client = new UserbackClient();

  await client.updateFeedback(id, { Workflow: workflow });

  if (opts.comment !== undefined) {
    try {
      await client.createComment({ feedbackId: id, comment: opts.comment });
    } catch (commentErr) {
      const err = commentErr instanceof Error ? commentErr : new Error(String(commentErr));
      if (opts.json) {
        const body = { closed: true, comment: errorPayload(err) };
        process.stdout.write(JSON.stringify(body) + "\n");
      } else {
        process.stderr.write(`ub: closed ${id} but failed to post comment\n`);
        process.stderr.write(`ub: ${err.message}\n`);
      }
      process.exit(EXIT.HTTP);
    }
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ closed: true, id }) + "\n");
  } else {
    process.stdout.write(`closed ${id}\n`);
  }
}

export function registerFeedback(program: Command): void {
  program
    .command("show <feedbackId>")
    .description("Show a single feedback item")
    .option("--json", "Emit JSON instead of a human-readable block")
    .action(showAction);

  program
    .command("list")
    .description("List feedback items (one page per invocation)")
    .option("--json", "Emit JSON instead of a human-readable table")
    .option("--limit <n>", `Page size (max ${MAX_LIST_PAGE_SIZE})`, "25")
    .option("--status <name>", "Filter by workflow stage name")
    .option("--project-id <id>", "Filter by project id")
    .option("--type <type>", "Filter by feedback type (General|Bug|Idea)")
    .action(listAction);

  program
    .command("create")
    .description("Create a new feedback item")
    .requiredOption("--title <title>", "Feedback title")
    .requiredOption("--body <body>", "Feedback description")
    .option("--type <type>", "General|Bug|Idea", "General")
    .option("--project-id <id>", "Overrides USERBACK_DEFAULT_PROJECT_ID")
    .option("--priority <priority>", "low|neutral|high|urgent")
    .option("--email <email>", "Overrides USERBACK_DEFAULT_EMAIL")
    .option("--json", "Emit JSON instead of printing just the new id")
    .action(createAction);

  program
    .command("close <feedbackId>")
    .description("Close a feedback item by advancing its workflow stage")
    .option("--comment <text>", "Post a comment after closing")
    .option("--json", "Emit JSON output")
    .action(closeAction);
}
```

Notes:

- `errorPayload` is now imported dynamically inside `closeAction` (matches the pattern of the other dynamic imports in this file). It was previously a top-level import in `cli.ts`.
- `ConfigError` is imported from `../../errors.js`. `createAction` throws it for the two missing-env cases.
- The `Command` import is `import type` — we only use it for typing the parameter.

- [ ] **Step 2: Update `src/cli.ts` — remove the four actions and call `registerFeedback`**

In `src/cli.ts`:

a) Remove the four action functions that used to be on lines 84-186 (`showAction`, `listAction`, `createAction`, `closeAction`).

b) Remove the `show`, `list`, `create`, and `close` subcommand blocks inside `buildProgram` (they were on lines 227-260 in the original).

c) In the same spot inside `buildProgram` (after the `.showHelpAfterError()` chain, before the `projects` parent command), add:

```ts
  registerFeedback(program);
```

d) Add this import near the top of the file:

```ts
import { registerFeedback } from "./cli/commands/feedback.js";
```

e) The imports from `./cli/validate.js` can now drop the names that `cli.ts` no longer uses. Specifically, after this edit `cli.ts` only needs `EXIT` from `validate.ts` — remove `POSITIVE_INT_RE`, `MAX_LIST_PAGE_SIZE`, `parsePositiveInt`, `validateFeedbackType`, `validatePriority`, `doubleSingleQuotes`, `buildCloseWorkflow` from the import list. Grep to verify: `grep -n "parsePositiveInt\|validateFeedbackType\|validatePriority\|doubleSingleQuotes\|buildCloseWorkflow\|MAX_LIST_PAGE_SIZE\|POSITIVE_INT_RE" src/cli.ts` should show zero matches.

f) The `import type { ... } from "./cli/types.js"` block added in Task 2 can now be removed entirely — after Task 3 moves all four feedback actions out of `cli.ts`, none of `JsonOpt`/`ListOpts`/`CreateOpts`/`CloseOpts`/`CommentOpts` are referenced in `cli.ts`. Verify with: `grep -n "JsonOpt\|ListOpts\|CreateOpts\|CloseOpts\|CommentOpts" src/cli.ts` — expect zero matches, then delete the import.

g) `cli.ts` still needs `errorPayload`? No — `closeAction` owns it now. Narrow the formatter import from `{ errorHuman, errorJson, errorPayload }` to `{ errorHuman, errorJson }`.

- [ ] **Step 3: Verify typecheck and tests pass**

```bash
npm run -s typecheck
```

Expected: `ok`

```bash
npm test --silent 2>&1 | tail -4
```

Expected: `tests 95`, `pass 95`, `fail 0`. In particular, `close` partial-failure tests (close succeeds, comment fails) must still pass — those exercise the `EXIT.HTTP` branch inside `closeAction`.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/feedback.ts src/cli.ts
git commit -m "$(cat <<'EOF'
Move feedback commands into src/cli/commands/feedback.ts

Shifts show/list/create/close — both their actions and their
Commander wiring — into a dedicated module. cli.ts now calls
registerFeedback(program) during assembly. errorPayload travels
with closeAction, narrowing cli.ts's formatter imports.
EOF
)"
git push
```

---

## Task 4: Move project actions into `src/cli/commands/projects.ts`

**Files:**

- Create: `src/cli/commands/projects.ts`
- Modify: `src/cli.ts` (remove the two project actions and the `projects` subcommand block; call `registerProjects`)

**What moves:** `projectsListAction`, `projectsShowAction`, and the `projects` parent-command block.

- [ ] **Step 1: Create `src/cli/commands/projects.ts`**

```ts
import type { Command } from "commander";
import { parsePositiveInt } from "../validate.js";
import type { JsonOpt } from "../types.js";

async function projectsListAction(opts: JsonOpt): Promise<void> {
  const { UserbackClient } = await import("../../client.js");
  const { projectListHuman, projectListJson } = await import("../../formatter.js");
  const client = new UserbackClient();
  const rows = await client.listProjects();
  const output = opts.json ? projectListJson(rows) : projectListHuman(rows);
  process.stdout.write(output);
}

async function projectsShowAction(projectIdRaw: string, opts: JsonOpt): Promise<void> {
  const id = parsePositiveInt(projectIdRaw, "projectId");
  const { UserbackClient } = await import("../../client.js");
  const { projectHuman, projectJson } = await import("../../formatter.js");
  const client = new UserbackClient();
  const project = await client.getProject(id);
  const output = opts.json ? projectJson(project) : projectHuman(project);
  process.stdout.write(output);
}

export function registerProjects(program: Command): void {
  const projects = program
    .command("projects")
    .description("Inspect projects in this workspace");

  projects
    .command("list")
    .description("List projects in the workspace")
    .option("--json", "Emit JSON instead of a human-readable table")
    .action(projectsListAction);

  projects
    .command("show <projectId>")
    .description("Show a single project with members")
    .option("--json", "Emit JSON instead of a human-readable block")
    .action(projectsShowAction);
}
```

- [ ] **Step 2: Update `src/cli.ts` — remove the actions, replace the block with a register call**

In `src/cli.ts`:

a) Remove `projectsListAction` and `projectsShowAction` (they were on lines 188-205 in the original).

b) Replace the `const projects = program.command("projects")...` block and its two `projects.command(...)` chains (they were on lines 262-276 in the original) with a single line:

```ts
  registerProjects(program);
```

c) Add the import near the top:

```ts
import { registerProjects } from "./cli/commands/projects.js";
```

- [ ] **Step 3: Verify typecheck and tests pass**

```bash
npm run -s typecheck
```

Expected: `ok`

```bash
npm test --silent 2>&1 | tail -4
```

Expected: `tests 95`, `pass 95`, `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/projects.ts src/cli.ts
git commit -m "$(cat <<'EOF'
Move project commands into src/cli/commands/projects.ts

projectsListAction / projectsShowAction and their Commander wiring
move into a dedicated module; cli.ts calls registerProjects(program)
during assembly.
EOF
)"
git push
```

---

## Task 5: Move the comment action into `src/cli/commands/comments.ts`

**Files:**

- Create: `src/cli/commands/comments.ts`
- Modify: `src/cli.ts` (remove `commentAction` and its subcommand block; call `registerComments`)

**What moves:** `commentAction` and the `comment` subcommand block.

- [ ] **Step 1: Create `src/cli/commands/comments.ts`**

```ts
import type { Command } from "commander";
import { parsePositiveInt } from "../validate.js";
import type { CommentOpts } from "../types.js";

async function commentAction(feedbackIdRaw: string, opts: CommentOpts): Promise<void> {
  const id = parsePositiveInt(feedbackIdRaw, "feedbackId");
  const { UserbackClient } = await import("../../client.js");
  const client = new UserbackClient();
  const created = await client.createComment({ feedbackId: id, comment: opts.body });
  if (opts.json) {
    process.stdout.write(JSON.stringify(created) + "\n");
  } else {
    process.stdout.write(`${created.id ?? "—"}\n`);
  }
}

export function registerComments(program: Command): void {
  program
    .command("comment <feedbackId>")
    .description("Add a comment to a feedback item")
    .requiredOption("--body <text>", "Comment body")
    .option("--json", "Emit JSON instead of the new comment id")
    .action(commentAction);
}
```

- [ ] **Step 2: Update `src/cli.ts` — remove the action, replace the block with a register call**

In `src/cli.ts`:

a) Remove `commentAction` (was on lines 207-217 in the original).

b) Replace the `comment <feedbackId>` subcommand block inside `buildProgram` (was on lines 278-283 in the original) with:

```ts
  registerComments(program);
```

c) Add the import near the top:

```ts
import { registerComments } from "./cli/commands/comments.js";
```

- [ ] **Step 3: Verify typecheck and tests pass**

```bash
npm run -s typecheck
```

Expected: `ok`

```bash
npm test --silent 2>&1 | tail -4
```

Expected: `tests 95`, `pass 95`, `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/comments.ts src/cli.ts
git commit -m "$(cat <<'EOF'
Move comment command into src/cli/commands/comments.ts

commentAction and its Commander wiring move into their own module;
cli.ts calls registerComments(program) during assembly.
EOF
)"
git push
```

---

## Task 6: Redirect `cli.ts` error imports to `./errors.js`

**Files:**

- Modify: `src/cli.ts` (narrow error-class imports to `./errors.js`; drop `./client.js` import if it's now unused)

**Why:** After tasks 3-5, `cli.ts` no longer touches `UserbackClient` — the only thing it pulls from `./client.js` is the error classes, and those originate in `./errors.js`. Importing directly from the source module removes the indirection. Per the spec's import-shape section.

- [ ] **Step 1: Rewrite the `./client.js` import in `src/cli.ts`**

Today the top of `src/cli.ts` has:

```ts
import { UserbackError, HTTPError, ConfigError, NetworkError, UnauthorizedError, NotFoundError, ValidationError, ServerError } from "./client.js";
```

Replace it with:

```ts
import {
  UserbackError,
  HTTPError,
  ConfigError,
  NetworkError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ServerError,
} from "./errors.js";
```

Notes:

- Double-check no other `./client.js` reference remains in `cli.ts`: `grep -n 'from "./client.js"' src/cli.ts` should show zero matches after this edit. If it does, something else is still depending on `client.ts` from `cli.ts` — investigate before moving on.
- `ConfigError` is actually unused directly by `cli.ts`'s top-level code after the split (it's only checked via `instanceof` in `exitCodeFor`). Leave it in the import list — `instanceof` still needs the class symbol.

- [ ] **Step 2: Verify typecheck and tests pass**

```bash
npm run -s typecheck
```

Expected: `ok`

```bash
npm test --silent 2>&1 | tail -4
```

Expected: `tests 95`, `pass 95`, `fail 0`.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "$(cat <<'EOF'
Point cli.ts's error-class imports at src/errors.js directly

After the per-command split, cli.ts no longer uses UserbackClient —
only the error classes, which originate in errors.ts. Importing
from the source module removes the client.ts re-export hop.
EOF
)"
git push
```

---

## Task 7: Final sanity check

- [ ] **Step 1: Confirm the final layout matches the spec**

```bash
ls src/ src/cli/ src/cli/commands/
```

Expected:

```text
src/:
cli-entry.ts  cli.ts  cli/  client.ts  env.ts  errors.ts  formatter.ts

src/cli/:
commands/  types.ts  validate.ts

src/cli/commands/:
comments.ts  feedback.ts  projects.ts
```

- [ ] **Step 2: Confirm `cli.ts` is trim**

```bash
wc -l src/cli.ts src/cli/validate.ts src/cli/types.ts src/cli/commands/*.ts
```

Expected: `src/cli.ts` around 90 lines (down from 345); `validate.ts` around 60; `types.ts` around 20; `feedback.ts` around 130; `projects.ts` around 40; `comments.ts` around 20.

- [ ] **Step 3: Final verification**

```bash
npm run -s typecheck && npm test --silent 2>&1 | tail -4
```

Expected: `ok`, then `tests 95`, `pass 95`, `fail 0`.

- [ ] **Step 4: Confirm everything is on the PR**

```bash
git log --oneline origin/main..HEAD | head -10
```

Expected: the six commits from this plan (one per task through Task 6) on top of the commits that were already on `code-review`.

```bash
git status
```

Expected: clean working tree.

No new commit needed for this task — it's verification only.
