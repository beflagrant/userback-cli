import { Command } from "commander";
import { createRequire } from "node:module";
import { UserbackError, HTTPError, ConfigError, NetworkError, UnauthorizedError, NotFoundError, ValidationError, ServerError } from "./client.js";
import { errorHuman, errorJson } from "./formatter.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

function parsePositiveInt(raw: string, name: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  return n;
}

const FEEDBACK_TYPES = new Set(["General", "Bug", "Idea"]);

function validateFeedbackType(t: string): void {
  if (!FEEDBACK_TYPES.has(t)) {
    throw new ConfigError(`--type must be one of General|Bug|Idea, got: ${t}`);
  }
}

function escapeODataString(s: string): string {
  return s.replaceAll("'", "''");
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
    .action(async (feedbackIdRaw: string, opts: { json?: boolean }) => {
      const id = parsePositiveInt(feedbackIdRaw, "feedbackId");
      const { UserbackClient } = await import("./client.js");
      const { feedbackHuman, feedbackJson } = await import("./formatter.js");
      const client = new UserbackClient();
      const row = await client.getFeedback(id);
      process.stdout.write(opts.json ? feedbackJson(row) : feedbackHuman(row));
    });

  program
    .command("list")
    .description("List feedback items (one page per invocation)")
    .option("--json", "Emit JSON instead of a human-readable table")
    .option("--limit <n>", "Page size (max 50)", "25")
    .option("--status <name>", "Filter by workflow stage name")
    .option("--project-id <id>", "Filter by project id")
    .option("--type <type>", "Filter by feedback type (General|Bug|Idea)")
    .action(async (opts: {
      json?: boolean;
      limit: string;
      status?: string;
      projectId?: string;
      type?: string;
    }) => {
      const requested = parsePositiveInt(opts.limit, "--limit");
      let limit = requested;
      if (limit > 50) {
        limit = 50;
        if (!opts.json) {
          process.stderr.write("ub: --limit clamped to API max of 50\n");
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
        filters.push(`Workflow/name eq '${escapeODataString(opts.status)}'`);
      }
      const filter = filters.length > 0 ? filters.join(" and ") : undefined;

      const { UserbackClient } = await import("./client.js");
      const { feedbackListHuman, feedbackListJson } = await import("./formatter.js");
      const client = new UserbackClient();
      const rows = await client.listFeedback({ limit, filter });
      process.stdout.write(opts.json ? feedbackListJson(rows) : feedbackListHuman(rows));
    });

  return program;
}

function exitCodeFor(err: Error): number {
  if (err instanceof ConfigError) return 2;
  if (err instanceof UnauthorizedError) return 3;
  if (err instanceof NotFoundError) return 4;
  if (err instanceof ValidationError) return 5;
  if (err instanceof HTTPError) return 6;
  if (err instanceof NetworkError) return 7;
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
