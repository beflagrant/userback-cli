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
    `created:   ${orDash(row.createdAt)}`,
    ``,
    orDash(row.description),
  ];
  return lines.join("\n") + "\n";
}

export function createdIdHuman(row: Feedback): string {
  return `${row.id}\n`;
}
