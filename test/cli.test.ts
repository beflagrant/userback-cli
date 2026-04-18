import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BIN = resolve(REPO_ROOT, "bin/ub.js");
const PKG_VERSION = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
).version as string;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], env: Record<string, string> = {}): Promise<RunResult> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/cli-entry.ts", ...args],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env, PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (b) => { stdout += b.toString(); });
  child.stderr.on("data", (b) => { stderr += b.toString(); });
  const [code] = await once(child, "exit");
  return { code: code as number | null, stdout, stderr };
}

test("ub --version prints package version", async () => {
  const { code, stdout } = await runCli(["--version"]);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), PKG_VERSION);
});
