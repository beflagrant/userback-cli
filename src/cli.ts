import { Command } from "commander";
import { createRequire } from "node:module";
import { UserbackError, HTTPError, ConfigError, NetworkError, UnauthorizedError, NotFoundError, ValidationError, ServerError } from "./client.js";
import { errorHuman, errorJson, errorPayload } from "./formatter.js";
import { loadDotenv } from "./env.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const POSITIVE_INT_RE = /^\d+$/;
const FEEDBACK_TYPES = new Set(["General", "Bug", "Idea"]);
const PRIORITIES = new Set(["low", "neutral", "high", "urgent"]);
const DEFAULT_CLOSED_STATUS = "Resolved";
const MAX_LIST_PAGE_SIZE = 50;

function parsePositiveInt(raw: string, name: string): number {
  if (!POSITIVE_INT_RE.test(raw)) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  return n;
}

function validateFeedbackType(t: string): void {
  if (!FEEDBACK_TYPES.has(t)) {
    throw new ConfigError(`--type must be one of General|Bug|Idea, got: ${t}`);
  }
}

function validatePriority(p: string): void {
  if (!PRIORITIES.has(p)) {
    throw new ConfigError(`--priority must be one of low|neutral|high|urgent, got: ${p}`);
  }
}

function doubleSingleQuotes(s: string): string {
  return s.replaceAll("'", "''");
}

function buildCloseWorkflow(): { id: number } | { name: string } {
  const raw = process.env.USERBACK_CLOSED_STATUS;
  if (raw !== undefined && POSITIVE_INT_RE.test(raw)) {
    return { id: Number(raw) };
  }
  return { name: raw ?? DEFAULT_CLOSED_STATUS };
}

type JsonOpt = { json?: boolean };

type ListOpts = JsonOpt & {
  limit: string;
  status?: string;
  projectId?: string;
  type?: string;
};

type CreateOpts = JsonOpt & {
  title: string;
  body: string;
  type: string;
  projectId?: string;
  priority?: string;
  email?: string;
};

type CloseOpts = JsonOpt & { comment?: string };

type CommentOpts = JsonOpt & { body: string };

async function showAction(feedbackIdRaw: string, opts: JsonOpt): Promise<void> {
  const id = parsePositiveInt(feedbackIdRaw, "feedbackId");
  const { UserbackClient } = await import("./client.js");
  const { feedbackHuman, feedbackJson } = await import("./formatter.js");
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

  const { UserbackClient } = await import("./client.js");
  const { feedbackListHuman, feedbackListJson } = await import("./formatter.js");
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

  const { UserbackClient } = await import("./client.js");
  const { feedbackJson, createdIdHuman } = await import("./formatter.js");
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

  const { UserbackClient } = await import("./client.js");
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
      process.exit(6);
    }
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ closed: true, id }) + "\n");
  } else {
    process.stdout.write(`closed ${id}\n`);
  }
}

async function projectsListAction(opts: JsonOpt): Promise<void> {
  const { UserbackClient } = await import("./client.js");
  const { projectListHuman, projectListJson } = await import("./formatter.js");
  const client = new UserbackClient();
  const rows = await client.listProjects();
  const output = opts.json ? projectListJson(rows) : projectListHuman(rows);
  process.stdout.write(output);
}

async function projectsShowAction(projectIdRaw: string, opts: JsonOpt): Promise<void> {
  const id = parsePositiveInt(projectIdRaw, "projectId");
  const { UserbackClient } = await import("./client.js");
  const { projectHuman, projectJson } = await import("./formatter.js");
  const client = new UserbackClient();
  const project = await client.getProject(id);
  const output = opts.json ? projectJson(project) : projectHuman(project);
  process.stdout.write(output);
}

async function commentAction(feedbackIdRaw: string, opts: CommentOpts): Promise<void> {
  const id = parsePositiveInt(feedbackIdRaw, "feedbackId");
  const { UserbackClient } = await import("./client.js");
  const client = new UserbackClient();
  const created = await client.createComment({ feedbackId: id, comment: opts.body });
  if (opts.json) {
    process.stdout.write(JSON.stringify(created) + "\n");
  } else {
    process.stdout.write(`${created.id ?? "—"}\n`);
  }
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name("ub")
    .description("Userback CLI (userback-cli)")
    .version(pkg.version)
    .showHelpAfterError();

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

  program
    .command("comment <feedbackId>")
    .description("Add a comment to a feedback item")
    .requiredOption("--body <text>", "Comment body")
    .option("--json", "Emit JSON instead of the new comment id")
    .action(commentAction);

  return program;
}

function exitCodeFor(err: Error): number {
  if (err instanceof ConfigError) {
    return 2;
  }
  if (err instanceof UnauthorizedError) {
    return 3;
  }
  if (err instanceof NotFoundError) {
    return 4;
  }
  if (err instanceof ValidationError) {
    return 5;
  }
  if (err instanceof HTTPError) {
    return 6;
  }
  if (err instanceof NetworkError) {
    return 7;
  }
  return 1;
}

function isJsonModeRequested(argv: string[]): boolean {
  return argv.includes("--json");
}

function reportError(err: Error, argv: string[]): void {
  const jsonMode = isJsonModeRequested(argv);
  if (err instanceof UserbackError) {
    if (jsonMode) {
      process.stdout.write(errorJson(err));
    } else {
      process.stderr.write(errorHuman(err));
    }
    return;
  }
  if (jsonMode) {
    process.stdout.write(errorJson(err));
  } else {
    process.stderr.write(errorHuman(err));
    if (process.env.UB_DEBUG === "1" && err.stack) {
      process.stderr.write(err.stack + "\n");
    }
  }
}

export async function run(argv: string[]): Promise<never> {
  loadDotenv();
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
    process.exit(0);
  } catch (caught) {
    const err = caught instanceof Error ? caught : new Error(String(caught));
    reportError(err, argv);
    process.exit(exitCodeFor(err));
  }
}
