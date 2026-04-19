import {
  ConfigError,
  NetworkError,
  HTTPError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ServerError,
} from "./client.js";
import type { Feedback } from "./client.js";

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
