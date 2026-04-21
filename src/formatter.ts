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
  if (value === undefined || value === null || value === "") {
    return DASH;
  }
  return String(value);
}

interface Column<T> {
  label: string;
  width: number;
  get: (row: T) => unknown;
  truncate?: boolean;
}

function renderTable<T>(rows: T[], cols: Column<T>[], tail: { label: string; get: (row: T) => unknown }): string {
  const header = [...cols.map((c) => c.label.padEnd(c.width)), tail.label].join("  ");
  const lines = [header];
  for (const row of rows) {
    const cells = cols.map((c) => {
      const raw = c.get(row);
      const shown = c.truncate && typeof raw === "string" ? truncate(raw, c.width) : raw;
      return orDash(shown).padEnd(c.width);
    });
    cells.push(orDash(tail.get(row)));
    lines.push(cells.join("  "));
  }
  return lines.join("\n") + "\n";
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

const FEEDBACK_COLUMNS: Column<Feedback>[] = [
  { label: "ID", width: 8, get: (r) => r.id },
  { label: "TYPE", width: 8, get: (r) => r.feedbackType },
  { label: "TITLE", width: 40, get: (r) => r.title, truncate: true },
  { label: "PRIORITY", width: 10, get: (r) => r.priority },
];

export function feedbackListHuman(rows: Feedback[]): string {
  if (rows.length === 0) {
    return "no feedback found\n";
  }
  return renderTable(rows, FEEDBACK_COLUMNS, { label: "CREATED", get: (r) => r.created });
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

const PROJECT_COLUMNS: Column<Project>[] = [
  { label: "ID", width: 10, get: (p) => p.id },
  { label: "NAME", width: 40, get: (p) => p.name, truncate: true },
  { label: "TYPE", width: 10, get: (p) => p.projectType },
];

export function projectListHuman(projects: Project[]): string {
  if (projects.length === 0) {
    return "no projects found\n";
  }
  return renderTable(projects, PROJECT_COLUMNS, {
    label: "ARCHIVED",
    get: (p) => (p.isArchived === undefined ? undefined : String(p.isArchived)),
  });
}

function kindOf(err: Error): string {
  if (err instanceof ConfigError) {
    return "config";
  }
  if (err instanceof UnauthorizedError) {
    return "unauthorized";
  }
  if (err instanceof NotFoundError) {
    return "not_found";
  }
  if (err instanceof ValidationError) {
    return "validation";
  }
  if (err instanceof ServerError) {
    return "server";
  }
  if (err instanceof HTTPError) {
    return "http";
  }
  if (err instanceof NetworkError) {
    return "network";
  }
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
