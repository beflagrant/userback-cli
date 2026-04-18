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

// Subprocess tests can't share a MockAgent with the parent (different process).
// Instead, stand up a local HTTP test server the child can hit.
import { createServer, type Server } from "node:http";

interface RouteHandler {
  (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void;
}

interface TestServer {
  url: string;
  close: () => Promise<void>;
  setHandler: (handler: RouteHandler) => void;
}

async function startTestServer(): Promise<TestServer> {
  let currentHandler: RouteHandler = (_req, res) => { res.statusCode = 500; res.end(); };
  const server: Server = createServer((req, res) => currentHandler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  const url = `http://127.0.0.1:${address.port}/1.0`;
  return {
    url,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    setHandler(handler) { currentHandler = handler; },
  };
}

async function collectBody(req: import("node:http").IncomingMessage): Promise<string> {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data;
}

describe("ub show", () => {
  let server: TestServer;

  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  test("prints human-formatted feedback on success", async () => {
    server.setHandler((req, res) => {
      assert.equal(req.method, "GET");
      assert.equal(req.url, "/1.0/feedback/42");
      assert.equal(req.headers.authorization, "Bearer test-key");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: 42, title: "hello", feedbackType: "Bug" }));
    });

    const { code, stdout, stderr } = await runCli(["show", "42"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    assert.match(stdout, /id:\s+42/);
    assert.match(stdout, /title:\s+hello/);
    assert.equal(stderr, "");
  });

  test("--json prints raw JSON", async () => {
    server.setHandler((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: 42, title: "hello" }));
    });
    const { code, stdout } = await runCli(["show", "42", "--json"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.id, 42);
  });

  test("invalid id exits 2 with ConfigError", async () => {
    const { code, stderr } = await runCli(["show", "abc"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 2);
    assert.match(stderr, /config/);
  });

  test("404 exits 4", async () => {
    server.setHandler((_req, res) => { res.statusCode = 404; res.end(); });
    const { code, stderr } = await runCli(["show", "999"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 4);
    assert.match(stderr, /not_found/);
  });
});
