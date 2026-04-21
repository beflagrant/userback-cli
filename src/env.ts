import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LINE_SEPARATOR_RE = /\r?\n/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseDotenv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(LINE_SEPARATOR_RE)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    if (!ENV_KEY_RE.test(key)) {
      continue;
    }

    let value = line.slice(eq + 1).trim();
    const doubleQuoted = value.startsWith('"') && value.endsWith('"') && value.length >= 2;
    const singleQuoted = value.startsWith("'") && value.endsWith("'") && value.length >= 2;
    if (doubleQuoted || singleQuoted) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadDotenv(cwd: string = process.cwd()): void {
  if (process.env.UB_SKIP_DOTENV === "1") {
    return;
  }
  const dotenvPath = resolve(cwd, ".env");
  let contents: string;
  try {
    contents = readFileSync(dotenvPath, "utf8");
  } catch {
    return;
  }
  const parsed = parseDotenv(contents);
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}
