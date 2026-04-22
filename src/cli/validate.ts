import { ConfigError } from "../errors.js";

export const POSITIVE_INT_RE = /^\d+$/;
export const FEEDBACK_TYPES = new Set(["General", "Bug", "Idea"]);
export const PRIORITIES = new Set(["low", "neutral", "high", "urgent"]);
export const DEFAULT_CLOSED_STATUS = "Resolved";
export const MAX_LIST_PAGE_SIZE = 50;

export const EXIT = {
  SUCCESS: 0,
  UNEXPECTED: 1,
  CONFIG: 2,
  UNAUTHORIZED: 3,
  NOT_FOUND: 4,
  VALIDATION: 5,
  HTTP: 6,
  NETWORK: 7,
} as const;

export function parsePositiveInt(raw: string, name: string): number {
  if (!POSITIVE_INT_RE.test(raw)) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  return n;
}

export function validateFeedbackType(t: string): void {
  if (!FEEDBACK_TYPES.has(t)) {
    throw new ConfigError(`--type must be one of General|Bug|Idea, got: ${t}`);
  }
}

export function validatePriority(p: string): void {
  if (!PRIORITIES.has(p)) {
    throw new ConfigError(`--priority must be one of low|neutral|high|urgent, got: ${p}`);
  }
}

export function doubleSingleQuotes(s: string): string {
  return s.replaceAll("'", "''");
}

export function buildCloseWorkflow(): { id: number } | { name: string } {
  const raw = process.env.USERBACK_CLOSED_STATUS;
  if (raw !== undefined && POSITIVE_INT_RE.test(raw)) {
    return { id: Number(raw) };
  }
  return { name: raw ?? DEFAULT_CLOSED_STATUS };
}
