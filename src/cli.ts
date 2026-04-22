import { Command } from "commander";
import { createRequire } from "node:module";
import { UserbackError, HTTPError, ConfigError, NetworkError, UnauthorizedError, NotFoundError, ValidationError, ServerError } from "./client.js";
import { errorHuman, errorJson } from "./formatter.js";
import { loadDotenv } from "./env.js";
import { EXIT, parsePositiveInt } from "./cli/validate.js";
import type { JsonOpt, CommentOpts } from "./cli/types.js";
import { registerFeedback } from "./cli/commands/feedback.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

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

  registerFeedback(program);

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
    return EXIT.CONFIG;
  }
  if (err instanceof UnauthorizedError) {
    return EXIT.UNAUTHORIZED;
  }
  if (err instanceof NotFoundError) {
    return EXIT.NOT_FOUND;
  }
  if (err instanceof ValidationError) {
    return EXIT.VALIDATION;
  }
  if (err instanceof HTTPError) {
    return EXIT.HTTP;
  }
  if (err instanceof NetworkError) {
    return EXIT.NETWORK;
  }
  return EXIT.UNEXPECTED;
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
    process.exit(EXIT.SUCCESS);
  } catch (caught) {
    const err = caught instanceof Error ? caught : new Error(String(caught));
    reportError(err, argv);
    process.exit(exitCodeFor(err));
  }
}
