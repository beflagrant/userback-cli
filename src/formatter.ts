import {
  ConfigError,
  NetworkError,
  HTTPError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ServerError,
} from "./client.js";
import type { Feedback, Project } from "./client.js";

const DASH = "—";

function orDash(value: unknown): string {
  if (value === undefined || value === null || value === "") return DASH;
  return String(value);
}

export function feedbackJson(row: Feedback): string {
  return JSON.stringify(row) + "\n";
}

export function feedbackHuman(row: Feedback): string {
  const lines = [
    `id:        ${orDash(row.id)}`,
    `type:      ${orDash(row.feedbackType)}`,
    `title:     ${orDash(row.title)}`,
    `priority:  ${orDash(row.priority)}`,
    `category:  ${orDash(row.category)}`,
    `created:   ${orDash(row.created)}`,
    ``,
    orDash(row.description),
  ];
  return lines.join("\n") + "\n";
}

export function createdIdHuman(row: Feedback): string {
  return `${row.id}\n`;
}

export function feedbackListJson(rows: Feedback[]): string {
  return JSON.stringify(rows) + "\n";
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function feedbackListHuman(rows: Feedback[]): string {
  if (rows.length === 0) return "no feedback found\n";

  const header = `${"ID".padEnd(8)}  ${"TYPE".padEnd(8)}  ${"TITLE".padEnd(40)}  ${"PRIORITY".padEnd(10)}  CREATED`;
  const lines = [header];

  for (const row of rows) {
    const id = orDashPad(row.id, 8);
    const type = orDashPad(row.feedbackType, 8);
    const title = orDashPad(row.title ? truncate(row.title, 40) : undefined, 40);
    const priority = orDashPad(row.priority, 10);
    const created = orDash(row.created);
    lines.push(`${id}  ${type}  ${title}  ${priority}  ${created}`);
  }
  return lines.join("\n") + "\n";
}

function orDashPad(value: unknown, width: number): string {
  const s = value === undefined || value === null || value === "" ? DASH : String(value);
  return s.padEnd(width);
}

export function projectJson(project: Project): string {
  return JSON.stringify(project) + "\n";
}

export function projectHuman(project: Project): string {
  const lines = [
    `id:         ${orDash(project.id)}`,
    `name:       ${orDash(project.name)}`,
    `type:       ${orDash(project.projectType)}`,
    `archived:   ${project.isArchived === undefined ? DASH : String(project.isArchived)}`,
    `created:    ${orDash(project.created)}`,
    `createdBy:  ${orDash(project.createdBy)}`,
  ];
  const members = project.Members ?? [];
  if (members.length > 0) {
    lines.push(``, `members:`);
    for (const m of members) {
      const role = orDash(m.role);
      const name = orDash(m.name);
      const email = orDash(m.email);
      lines.push(`  - ${name} <${email}> (${role})`);
    }
  }
  return lines.join("\n") + "\n";
}

export function projectListJson(projects: Project[]): string {
  return JSON.stringify(projects) + "\n";
}

export function projectListHuman(projects: Project[]): string {
  if (projects.length === 0) return "no projects found\n";

  const header = `${"ID".padEnd(10)}  ${"NAME".padEnd(40)}  ${"TYPE".padEnd(10)}  ARCHIVED`;
  const lines = [header];
  for (const p of projects) {
    const id = orDashPad(p.id, 10);
    const name = orDashPad(p.name ? truncate(p.name, 40) : undefined, 40);
    const type = orDashPad(p.projectType, 10);
    const archived = p.isArchived === undefined ? DASH : String(p.isArchived);
    lines.push(`${id}  ${name}  ${type}  ${archived}`);
  }
  return lines.join("\n") + "\n";
}

function kindOf(err: Error): string {
  if (err instanceof ConfigError) return "config";
  if (err instanceof UnauthorizedError) return "unauthorized";
  if (err instanceof NotFoundError) return "not_found";
  if (err instanceof ValidationError) return "validation";
  if (err instanceof ServerError) return "server";
  if (err instanceof HTTPError) return "http";
  if (err instanceof NetworkError) return "network";
  return "unexpected";
}

export function errorHuman(err: Error): string {
  return `ub: ${kindOf(err)}: ${err.message}\n`;
}

export interface ErrorPayload {
  error: {
    kind: string;
    message: string;
    status?: number;
    body?: unknown;
  };
}

export function errorPayload(err: Error): ErrorPayload {
  const payload: ErrorPayload = {
    error: { kind: kindOf(err), message: err.message },
  };
  if (err instanceof HTTPError) {
    payload.error.status = err.status;
    payload.error.body = err.body;
  }
  return payload;
}

export function errorJson(err: Error): string {
  return JSON.stringify(errorPayload(err)) + "\n";
}
