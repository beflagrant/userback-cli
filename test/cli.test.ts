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
      env: {
        ...process.env,
        UB_SKIP_DOTENV: "1",
        ...env,
        PATH: process.env.PATH ?? "",
      },
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

describe("ub list", () => {
  let server: TestServer;

  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  test("default query: page=1&limit=25, no filter", async () => {
    server.setHandler((req, res) => {
      assert.equal(req.method, "GET");
      assert.equal(req.url, "/1.0/feedback?page=1&limit=25");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify([{ id: 1, title: "a" }, { id: 2, title: "b" }]));
    });
    const { code, stdout } = await runCli(["list"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    assert.match(stdout, /^ID\s+TYPE\s+TITLE/m);
    assert.match(stdout, /\b1\b/);
    assert.match(stdout, /\b2\b/);
  });

  test("--json outputs parseable array", async () => {
    server.setHandler((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify([{ id: 1 }]));
    });
    const { code, stdout } = await runCli(["list", "--json"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.length, 1);
  });

  test("--limit 10 --type Bug --project-id 7 composes OData filter", async () => {
    server.setHandler((req, res) => {
      assert.ok(req.url?.includes("limit=10"));
      assert.ok(req.url?.includes("filter="));
      const url = new URL(`http://x${req.url!}`);
      const filter = url.searchParams.get("filter") ?? "";
      assert.match(filter, /projectId eq 7/);
      assert.match(filter, /feedbackType eq 'Bug'/);
      res.setHeader("content-type", "application/json");
      res.end("[]");
    });
    const { code } = await runCli(
      ["list", "--limit", "10", "--type", "Bug", "--project-id", "7"],
      { USERBACK_API_KEY: "test-key", USERBACK_BASE_URL: server.url },
    );
    assert.equal(code, 0);
  });

  test("--limit above 50 is clamped to 50 (stderr warning in human mode)", async () => {
    server.setHandler((req, res) => {
      assert.ok(req.url?.includes("limit=50"));
      res.setHeader("content-type", "application/json");
      res.end("[]");
    });
    const { code, stderr } = await runCli(
      ["list", "--limit", "9999"],
      { USERBACK_API_KEY: "test-key", USERBACK_BASE_URL: server.url },
    );
    assert.equal(code, 0);
    assert.match(stderr, /clamped/i);
  });

  test("--json + --limit above 50 clamps silently", async () => {
    server.setHandler((req, res) => {
      assert.ok(req.url?.includes("limit=50"));
      res.setHeader("content-type", "application/json");
      res.end("[]");
    });
    const { code, stderr } = await runCli(
      ["list", "--limit", "9999", "--json"],
      { USERBACK_API_KEY: "test-key", USERBACK_BASE_URL: server.url },
    );
    assert.equal(code, 0);
    assert.equal(stderr, "");
  });
});

describe("ub create", () => {
  let server: TestServer;

  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  test("sends required fields; prints id on success", async () => {
    server.setHandler(async (req, res) => {
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/1.0/feedback");
      const body = await collectBody(req);
      const parsed = JSON.parse(body);
      assert.equal(parsed.projectId, 7);
      assert.equal(parsed.email, "me@example.com");
      assert.equal(parsed.feedbackType, "General");
      assert.equal(parsed.title, "hello");
      assert.equal(parsed.description, "world");
      res.setHeader("content-type", "application/json");
      res.statusCode = 201;
      res.end(JSON.stringify({ id: 123 }));
    });

    const { code, stdout } = await runCli(
      ["create", "--title", "hello", "--body", "world"],
      {
        USERBACK_API_KEY: "test-key",
        USERBACK_BASE_URL: server.url,
        USERBACK_DEFAULT_PROJECT_ID: "7",
        USERBACK_DEFAULT_EMAIL: "me@example.com",
      },
    );
    assert.equal(code, 0);
    assert.equal(stdout.trim(), "123");
  });

  test("--json prints full response", async () => {
    server.setHandler((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.statusCode = 201;
      res.end(JSON.stringify({ id: 123, title: "hello" }));
    });
    const { code, stdout } = await runCli(
      ["create", "--title", "hello", "--body", "world", "--json"],
      {
        USERBACK_API_KEY: "test-key",
        USERBACK_BASE_URL: server.url,
        USERBACK_DEFAULT_PROJECT_ID: "7",
        USERBACK_DEFAULT_EMAIL: "me@example.com",
      },
    );
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.id, 123);
  });

  test("missing project-id and env var exits 2 ConfigError", async () => {
    const { code, stderr } = await runCli(
      ["create", "--title", "hello", "--body", "world"],
      {
        USERBACK_API_KEY: "test-key",
        USERBACK_BASE_URL: server.url,
        USERBACK_DEFAULT_EMAIL: "me@example.com",
      },
    );
    assert.equal(code, 2);
    assert.match(stderr, /project-id/i);
  });

  test("missing email and env var exits 2 ConfigError", async () => {
    const { code, stderr } = await runCli(
      ["create", "--title", "hello", "--body", "world"],
      {
        USERBACK_API_KEY: "test-key",
        USERBACK_BASE_URL: server.url,
        USERBACK_DEFAULT_PROJECT_ID: "7",
      },
    );
    assert.equal(code, 2);
    assert.match(stderr, /email/i);
  });

  test("invalid --type exits 2", async () => {
    const { code, stderr } = await runCli(
      ["create", "--title", "hello", "--body", "world", "--type", "Nope"],
      {
        USERBACK_API_KEY: "test-key",
        USERBACK_BASE_URL: server.url,
        USERBACK_DEFAULT_PROJECT_ID: "7",
        USERBACK_DEFAULT_EMAIL: "me@example.com",
      },
    );
    assert.equal(code, 2);
    assert.match(stderr, /type/i);
  });

  test("--priority and --type override defaults", async () => {
    server.setHandler(async (req, res) => {
      const body = JSON.parse(await collectBody(req));
      assert.equal(body.feedbackType, "Bug");
      assert.equal(body.priority, "high");
      res.setHeader("content-type", "application/json");
      res.statusCode = 201;
      res.end(JSON.stringify({ id: 1 }));
    });
    const { code } = await runCli(
      [
        "create",
        "--title", "t",
        "--body", "b",
        "--type", "Bug",
        "--priority", "high",
      ],
      {
        USERBACK_API_KEY: "test-key",
        USERBACK_BASE_URL: server.url,
        USERBACK_DEFAULT_PROJECT_ID: "7",
        USERBACK_DEFAULT_EMAIL: "me@example.com",
      },
    );
    assert.equal(code, 0);
  });
});

describe("ub close", () => {
  let server: TestServer;

  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  test("PATCH with Workflow.name='Resolved' by default", async () => {
    server.setHandler(async (req, res) => {
      assert.equal(req.method, "PATCH");
      assert.equal(req.url, "/1.0/feedback/42");
      const body = JSON.parse(await collectBody(req));
      assert.deepEqual(body, { Workflow: { name: "Resolved" } });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: 42 }));
    });
    const { code, stdout } = await runCli(["close", "42"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    assert.match(stdout, /closed/i);
  });

  test("USERBACK_CLOSED_STATUS=Shipped sends name=Shipped", async () => {
    server.setHandler(async (req, res) => {
      const body = JSON.parse(await collectBody(req));
      assert.deepEqual(body, { Workflow: { name: "Shipped" } });
      res.setHeader("content-type", "application/json");
      res.end("{}");
    });
    const { code } = await runCli(["close", "42"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
      USERBACK_CLOSED_STATUS: "Shipped",
    });
    assert.equal(code, 0);
  });

  test("USERBACK_CLOSED_STATUS=9 sends numeric id", async () => {
    server.setHandler(async (req, res) => {
      const body = JSON.parse(await collectBody(req));
      assert.deepEqual(body, { Workflow: { id: 9 } });
      res.setHeader("content-type", "application/json");
      res.end("{}");
    });
    const { code } = await runCli(["close", "42"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
      USERBACK_CLOSED_STATUS: "9",
    });
    assert.equal(code, 0);
  });

  test("--comment sends PATCH then POST /feedback/comment", async () => {
    let sawPatch = false;
    let sawComment = false;
    server.setHandler(async (req, res) => {
      if (req.method === "PATCH" && req.url === "/1.0/feedback/42") {
        sawPatch = true;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: 42 }));
      } else if (req.method === "POST" && req.url === "/1.0/feedback/comment") {
        const body = JSON.parse(await collectBody(req));
        assert.deepEqual(body, { feedbackId: 42, comment: "fixed" });
        sawComment = true;
        res.setHeader("content-type", "application/json");
        res.statusCode = 201;
        res.end(JSON.stringify({ id: 101 }));
      } else {
        res.statusCode = 500;
        res.end();
      }
    });
    const { code } = await runCli(["close", "42", "--comment", "fixed"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    assert.ok(sawPatch);
    assert.ok(sawComment);
  });

  test("PATCH success + comment failure → exit 6, partial success on stderr", async () => {
    server.setHandler(async (req, res) => {
      if (req.method === "PATCH") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: 42 }));
      } else if (req.method === "POST") {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "boom" }));
      }
    });
    const { code, stderr } = await runCli(["close", "42", "--comment", "x"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 6);
    assert.match(stderr, /closed/i);
    assert.match(stderr, /comment/i);
  });

  test("--json partial success emits structured JSON on stdout", async () => {
    server.setHandler(async (req, res) => {
      if (req.method === "PATCH") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: 42 }));
      } else {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "boom" }));
      }
    });
    const { code, stdout } = await runCli(
      ["close", "42", "--comment", "x", "--json"],
      { USERBACK_API_KEY: "test-key", USERBACK_BASE_URL: server.url },
    );
    assert.equal(code, 6);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.closed, true);
    assert.equal(parsed.comment.error.kind, "server");
  });
});

describe("ub comment", () => {
  let server: TestServer;

  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  test("POST /feedback/comment with feedbackId in body", async () => {
    server.setHandler(async (req, res) => {
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/1.0/feedback/comment");
      const body = JSON.parse(await collectBody(req));
      assert.deepEqual(body, { feedbackId: 42, comment: "hello" });
      res.setHeader("content-type", "application/json");
      res.statusCode = 201;
      res.end(JSON.stringify({ id: 888 }));
    });
    const { code, stdout } = await runCli(["comment", "42", "--body", "hello"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    assert.match(stdout, /888/);
  });

  test("--json prints parseable response", async () => {
    server.setHandler((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.statusCode = 201;
      res.end(JSON.stringify({ id: 888, comment: "hello" }));
    });
    const { code, stdout } = await runCli(
      ["comment", "42", "--body", "hello", "--json"],
      { USERBACK_API_KEY: "test-key", USERBACK_BASE_URL: server.url },
    );
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.id, 888);
  });

  test("missing --body errors from Commander (exit 1)", async () => {
    const { code, stderr } = await runCli(["comment", "42"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.notEqual(code, 0);
    assert.match(stderr, /body/);
  });
});

describe("ub projects list", () => {
  let server: TestServer;
  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  test("human mode renders a table from {data: [...]} response", async () => {
    server.setHandler((req, res) => {
      assert.equal(req.method, "GET");
      assert.equal(req.url, "/1.0/project");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        data: [
          { id: 1, name: "alpha", projectType: "feedback", isArchived: false },
          { id: 2, name: "beta",  projectType: "bug",      isArchived: true  },
        ],
      }));
    });

    const { code, stdout } = await runCli(["projects", "list"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    assert.match(stdout, /ID\s+NAME/);
    assert.match(stdout, /alpha/);
    assert.match(stdout, /beta/);
  });

  test("--json emits a parseable array", async () => {
    server.setHandler((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: 1, name: "alpha" }] }));
    });
    const { code, stdout } = await runCli(["projects", "list", "--json"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, 1);
  });
});

describe("ub projects show", () => {
  let server: TestServer;
  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  test("renders human block with members", async () => {
    server.setHandler((req, res) => {
      assert.equal(req.method, "GET");
      assert.equal(req.url, "/1.0/project/139657");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: 139657,
        name: "My first project",
        projectType: "feedback",
        Members: [{ id: 1, name: "Jim", email: "jim@example.com", role: "Admin" }],
      }));
    });

    const { code, stdout } = await runCli(["projects", "show", "139657"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 0);
    assert.match(stdout, /id:\s+139657/);
    assert.match(stdout, /Jim <jim@example\.com> \(Admin\)/);
  });

  test("invalid id exits 2", async () => {
    const { code, stderr } = await runCli(["projects", "show", "abc"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 2);
    assert.match(stderr, /config/);
  });

  test("404 exits 4", async () => {
    server.setHandler((_req, res) => {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: "Not Found" }));
    });
    const { code, stderr } = await runCli(["projects", "show", "999"], {
      USERBACK_API_KEY: "test-key",
      USERBACK_BASE_URL: server.url,
    });
    assert.equal(code, 4);
    assert.match(stderr, /not_found/);
  });
});

describe("build artifact (post tsc)", () => {
  test("./bin/ub.js --version works under plain node", async () => {
    const child = spawn(process.execPath, [BIN, "--version"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (b) => { stdout += b.toString(); });
    const [code] = await once(child, "exit");
    assert.equal(code, 0);
    assert.equal(stdout.trim(), PKG_VERSION);
  });
});
