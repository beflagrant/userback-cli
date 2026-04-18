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
