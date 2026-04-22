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
