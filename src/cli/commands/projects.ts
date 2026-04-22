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
