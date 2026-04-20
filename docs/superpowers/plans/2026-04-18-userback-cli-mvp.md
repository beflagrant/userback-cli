# userback-cli MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship a Node/TypeScript CLI (`userback-cli` → binary `ub`) that wraps the Userback REST API with five subcommands (`list`, `show`, `create`, `close`, `comment`), publishable to npm and usable by LLM agents in shell pipelines.

**Architecture:** Four TypeScript source files with single responsibilities — `client.ts` (fetch wrapper + typed error hierarchy), `formatter.ts` (pure human/JSON output functions), `cli.ts` (Commander dispatch + exit-code mapping), and a hand-written ESM shebang at `bin/ub.js` that dynamic-imports compiled `dist/cli.js`. No bundler; `tsc` compiles at publish time.

**Tech Stack:** Node 24 LTS, TypeScript 5 (ESM, NodeNext resolution), Commander 12, native `fetch`, `node:test` runner via `tsx`, `undici` `MockAgent` for HTTP stubbing.

**Spec:** [docs/superpowers/specs/2026-04-18-userback-cli-mvp-design.md](../specs/2026-04-18-userback-cli-mvp-design.md)

**ADRs:** [0001 close via workflow](../../adr/0001-close-via-workflow-stage.md), [0002 stack](../../adr/0002-esm-typescript-commander-fetch.md), [0003 stream contract](../../adr/0003-output-stream-contract.md), [0004 package/publish](../../adr/0004-package-name-and-publish-shape.md)

---

## File structure at completion

```
bin/ub.js                        # shebang stub, plain JS
src/cli.ts                       # Commander program + run(argv)
src/client.ts                    # UserbackClient + error hierarchy + types
src/formatter.ts                 # pure formatter functions
dist/                            # tsc output, gitignored, shipped
test/helpers/mock-agent.ts       # MockAgent setup helpers
test/formatter.test.ts
test/client.test.ts
test/cli.test.ts
tsconfig.json
package.json
.gitignore
.nvmrc                           # pins Node 24.15.0 for contributors
README.md
LICENSE                          # MIT
```

Existing at start:
```
docs/adr/...                     # four ADRs already committed
docs/superpowers/specs/...       # spec already committed
.git/                            # repo initialized, one commit on main
```

---

## Task 1: Scaffold package.json, tsconfig, .gitignore, .nvmrc

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.nvmrc`

- [ ] **Step 1: Verify working directory and Node version**

Run: `pwd && node --version && npm --version`
Expected:
```
/Users/jim/code/userback
v24.15.0
11.12.1
```
If Node is not 24.x, run `nvm use 24.15.0` first.

- [ ] **Step 2: Create .nvmrc**

Create `.nvmrc`:

```
24.15.0
```

- [ ] **Step 3: Create .gitignore**

Create `.gitignore`:

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 4: Create tsconfig.json**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": false,
    "sourceMap": false,
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 5: Create package.json**

Create `package.json`:

```json
{
  "name": "userback-cli",
  "version": "0.1.0",
  "description": "Command-line tool for the Userback REST API. Install as userback-cli, invoke as ub.",
  "type": "module",
  "bin": {
    "ub": "./bin/ub.js"
  },
  "files": [
    "dist/",
    "bin/",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test 'test/**/*.test.ts'",
    "test:watch": "node --import tsx --test --watch 'test/**/*.test.ts'",
    "prepublishOnly": "npm run typecheck && npm test && npm run build"
  },
  "dependencies": {
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "undici": "^6.20.0"
  },
  "keywords": ["userback", "cli", "feedback"],
  "license": "MIT"
}
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: `added N packages`, `package-lock.json` written, no errors.

- [ ] **Step 7: Verify the TypeScript compiler runs**

Run: `npx tsc --version && npx tsc --noEmit`
Expected: version printed (5.x), no output from `--noEmit` (empty project still passes).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .nvmrc
git commit -m "Scaffold Node/TS project with ESM, Node 24 engines, and dev deps"
```

---

## Task 2: Error hierarchy and types in src/client.ts

**Files:**
- Create: `src/client.ts`
- Create: `test/client.test.ts`
- Create: `test/helpers/mock-agent.ts` (stub, filled in Task 3)

This task lands the exported error classes and type interfaces only. No
`UserbackClient` methods yet. We verify the types compile and the error
constructors behave correctly.

- [ ] **Step 1: Write the failing test for error hierarchy**

Create `test/client.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UserbackError,
  ConfigError,
  NetworkError,
  HTTPError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ServerError,
} from "../src/client.js";

test("ConfigError extends UserbackError", () => {
  const err = new ConfigError("missing key");
  assert.ok(err instanceof UserbackError);
  assert.ok(err instanceof ConfigError);
  assert.equal(err.message, "missing key");
  assert.equal(err.name, "ConfigError");
});

test("NetworkError extends UserbackError", () => {
  const err = new NetworkError("ECONNREFUSED");
  assert.ok(err instanceof UserbackError);
  assert.equal(err.name, "NetworkError");
});

test("HTTPError carries status and body", () => {
  const err = new HTTPError(500, { msg: "boom" }, "server error");
  assert.ok(err instanceof UserbackError);
  assert.equal(err.status, 500);
  assert.deepEqual(err.body, { msg: "boom" });
  assert.equal(err.message, "server error");
});

test("UnauthorizedError, NotFoundError, ValidationError, ServerError all extend HTTPError", () => {
  assert.ok(new UnauthorizedError(401, null, "nope") instanceof HTTPError);
  assert.ok(new NotFoundError(404, null, "nope") instanceof HTTPError);
  assert.ok(new ValidationError(422, null, "nope") instanceof HTTPError);
  assert.ok(new ServerError(503, null, "nope") instanceof HTTPError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/client.js'` or similar.

- [ ] **Step 3: Implement error hierarchy and types**

Create `src/client.ts`:

```ts
export class UserbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserbackError";
  }
}

export class ConfigError extends UserbackError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class NetworkError extends UserbackError {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class HTTPError extends UserbackError {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "HTTPError";
  }
}

export class UnauthorizedError extends HTTPError {
  constructor(status: number, body: unknown, message: string) {
    super(status, body, message);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends HTTPError {
  constructor(status: number, body: unknown, message: string) {
    super(status, body, message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends HTTPError {
  constructor(status: number, body: unknown, message: string) {
    super(status, body, message);
    this.name = "ValidationError";
  }
}

export class ServerError extends HTTPError {
  constructor(status: number, body: unknown, message: string) {
    super(status, body, message);
    this.name = "ServerError";
  }
}

export interface Feedback {
  id: number;
  projectId?: number;
  feedbackType?: string;
  title?: string;
  description?: string;
  priority?: string;
  category?: string;
  rating?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface Comment {
  id: number;
  feedbackId?: number;
  comment?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ListFeedbackOptions {
  page?: number;
  limit?: number;
  sort?: string;
  filter?: string;
}

export interface CreateFeedbackAttrs {
  projectId: number;
  email: string;
  feedbackType: "General" | "Bug" | "Idea";
  title: string;
  description: string;
  priority?: "low" | "neutral" | "high" | "urgent";
}

export interface UpdateFeedbackAttrs {
  feedbackType?: "General" | "Bug" | "Idea";
  title?: string;
  description?: string;
  priority?: "low" | "neutral" | "high" | "urgent";
  Workflow?: { id: number } | { name: string };
}
```

- [ ] **Step 4: Create test helper stub**

Create `test/helpers/mock-agent.ts`:

```ts
// Filled in Task 3 when UserbackClient gains HTTP behavior.
export {};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 4 tests green.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add src/client.ts test/client.test.ts test/helpers/mock-agent.ts
git commit -m "Add UserbackError hierarchy and API type interfaces"
```

---

## Task 3: MockAgent test helper + request() plumbing

**Files:**
- Modify: `test/helpers/mock-agent.ts`
- Modify: `src/client.ts`
- Modify: `test/client.test.ts`

Introduces the MockAgent helper and a minimal `UserbackClient` class
with the private `request()` method. No public API verbs yet — we land
only the auth, URL, error-translation, and network-error behavior.

- [ ] **Step 1: Implement MockAgent helper**

Replace `test/helpers/mock-agent.ts` contents with:

```ts
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from "undici";

let agent: MockAgent | null = null;
let previous: Dispatcher | null = null;

export function installMockAgent(): MockAgent {
  previous = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  return agent;
}

export function restoreDispatcher(): void {
  if (previous) setGlobalDispatcher(previous);
  agent = null;
  previous = null;
}

export function mockPool(agent: MockAgent, origin: string) {
  return agent.get(origin);
}

export const TEST_BASE_URL = "http://localhost:4000/1.0";
export const TEST_ORIGIN = "http://localhost:4000";
export const TEST_API_KEY = "test-key";
```

- [ ] **Step 2: Write failing tests for UserbackClient construction and request plumbing**

Append to `test/client.test.ts`:

```ts
import { after, before, beforeEach, describe } from "node:test";
import { UserbackClient } from "../src/client.js";
import {
  installMockAgent,
  restoreDispatcher,
  mockPool,
  TEST_BASE_URL,
  TEST_ORIGIN,
  TEST_API_KEY,
} from "./helpers/mock-agent.js";
import type { MockAgent } from "undici";

describe("UserbackClient construction", () => {
  const savedKey = process.env.USERBACK_API_KEY;
  const savedUrl = process.env.USERBACK_BASE_URL;

  beforeEach(() => {
    delete process.env.USERBACK_API_KEY;
    delete process.env.USERBACK_BASE_URL;
  });

  after(() => {
    if (savedKey !== undefined) process.env.USERBACK_API_KEY = savedKey;
    if (savedUrl !== undefined) process.env.USERBACK_BASE_URL = savedUrl;
  });

  test("throws ConfigError when USERBACK_API_KEY is missing", () => {
    assert.throws(() => new UserbackClient(), {
      name: "ConfigError",
      message: /USERBACK_API_KEY/,
    });
  });

  test("constructs successfully with API key set", () => {
    process.env.USERBACK_API_KEY = TEST_API_KEY;
    const client = new UserbackClient();
    assert.ok(client);
  });
});

describe("UserbackClient request plumbing", () => {
  let agent: MockAgent;

  before(() => {
    process.env.USERBACK_API_KEY = TEST_API_KEY;
    process.env.USERBACK_BASE_URL = TEST_BASE_URL;
  });

  beforeEach(() => {
    agent = installMockAgent();
  });

  after(() => {
    restoreDispatcher();
  });

  test("sends Authorization: Bearer and returns parsed JSON on 200", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({ path: "/1.0/feedback/42", method: "GET" })
      .reply(200, { id: 42, title: "hello" }, {
        headers: { "content-type": "application/json" },
      });

    const client = new UserbackClient();
    const got = await client.getFeedback(42);
    assert.equal(got.id, 42);
    assert.equal(got.title, "hello");
  });

  test("translates 401 to UnauthorizedError", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({ path: "/1.0/feedback/42", method: "GET" })
      .reply(401, { error: "bad token" }, {
        headers: { "content-type": "application/json" },
      });

    const client = new UserbackClient();
    await assert.rejects(() => client.getFeedback(42), {
      name: "UnauthorizedError",
    });
  });

  test("translates 404 to NotFoundError", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({ path: "/1.0/feedback/42", method: "GET" })
      .reply(404, { error: "not found" });

    const client = new UserbackClient();
    await assert.rejects(() => client.getFeedback(42), {
      name: "NotFoundError",
    });
  });

  test("translates 422 to ValidationError carrying body", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({ path: "/1.0/feedback/42", method: "GET" })
      .reply(422, { field: "title", error: "required" }, {
        headers: { "content-type": "application/json" },
      });

    const client = new UserbackClient();
    await assert.rejects(
      () => client.getFeedback(42),
      (err: unknown) => {
        assert.ok(err instanceof Error && err.name === "ValidationError");
        const ve = err as { body: unknown; status: number };
        assert.equal(ve.status, 422);
        assert.deepEqual(ve.body, { field: "title", error: "required" });
        return true;
      },
    );
  });

  test("translates 500 to ServerError", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({ path: "/1.0/feedback/42", method: "GET" })
      .reply(500, "boom");

    const client = new UserbackClient();
    await assert.rejects(() => client.getFeedback(42), {
      name: "ServerError",
    });
  });

  test("translates 418 (other 4xx) to generic HTTPError", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({ path: "/1.0/feedback/42", method: "GET" })
      .reply(418, "teapot");

    const client = new UserbackClient();
    await assert.rejects(
      () => client.getFeedback(42),
      (err: unknown) => {
        assert.ok(err instanceof Error && err.name === "HTTPError");
        return true;
      },
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — the construction tests fail with "UserbackClient is not a constructor" or similar, and the request tests fail because `getFeedback` is missing.

- [ ] **Step 4: Implement UserbackClient and request() in src/client.ts**

Append to `src/client.ts` (below the existing exports):

```ts
const DEFAULT_BASE_URL = "https://rest.userback.io/1.0";

type HTTPMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

export class UserbackClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    const apiKey = process.env.USERBACK_API_KEY;
    if (!apiKey) {
      throw new ConfigError("USERBACK_API_KEY is required");
    }
    this.apiKey = apiKey;
    this.baseUrl = process.env.USERBACK_BASE_URL ?? DEFAULT_BASE_URL;
  }

  async getFeedback(id: number): Promise<Feedback> {
    return this.request<Feedback>("GET", `/feedback/${id}`);
  }

  private async request<T>(
    method: HTTPMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const init: RequestInit = {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new NetworkError(message);
    }

    if (!response.ok) {
      const body = await this.readBody(response);
      const message = this.summarizeError(response.status, body);
      throw this.errorForStatus(response.status, body, message);
    }

    return (await response.json()) as T;
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async readBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }
    try {
      return await response.text();
    } catch {
      return null;
    }
  }

  private summarizeError(status: number, body: unknown): string {
    if (typeof body === "string" && body.length > 0) {
      return `HTTP ${status}: ${body.slice(0, 200)}`;
    }
    if (body && typeof body === "object") {
      try {
        return `HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;
      } catch {
        return `HTTP ${status}`;
      }
    }
    return `HTTP ${status}`;
  }

  private errorForStatus(status: number, body: unknown, message: string): HTTPError {
    if (status === 401) return new UnauthorizedError(status, body, message);
    if (status === 404) return new NotFoundError(status, body, message);
    if (status === 422) return new ValidationError(status, body, message);
    if (status >= 500) return new ServerError(status, body, message);
    return new HTTPError(status, body, message);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all existing error-class tests still green, plus 8 new tests for construction and request behavior.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/client.ts test/client.test.ts test/helpers/mock-agent.ts
git commit -m "Implement UserbackClient constructor and request() with fetch + error translation"
```

---

## Task 4: listFeedback()

**Files:**
- Modify: `src/client.ts`
- Modify: `test/client.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/client.test.ts`:

```ts
describe("listFeedback", () => {
  let agent: MockAgent;

  before(() => {
    process.env.USERBACK_API_KEY = TEST_API_KEY;
    process.env.USERBACK_BASE_URL = TEST_BASE_URL;
  });

  beforeEach(() => {
    agent = installMockAgent();
  });

  after(() => {
    restoreDispatcher();
  });

  test("GET /feedback with default query (page=1, limit=25)", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({
        path: "/1.0/feedback?page=1&limit=25",
        method: "GET",
      })
      .reply(200, [{ id: 1 }, { id: 2 }], {
        headers: { "content-type": "application/json" },
      });

    const client = new UserbackClient();
    const rows = await client.listFeedback({});
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.id, 1);
  });

  test("GET /feedback with limit, filter, sort", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({
        path: "/1.0/feedback?page=1&limit=10&sort=createdAt+desc&filter=feedbackType+eq+%27Bug%27",
        method: "GET",
      })
      .reply(200, [], { headers: { "content-type": "application/json" } });

    const client = new UserbackClient();
    const rows = await client.listFeedback({
      limit: 10,
      sort: "createdAt desc",
      filter: "feedbackType eq 'Bug'",
    });
    assert.deepEqual(rows, []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `client.listFeedback is not a function`.

- [ ] **Step 3: Implement listFeedback**

Add method to `UserbackClient` in `src/client.ts` (inside the class, below `getFeedback`):

```ts
  async listFeedback(options: ListFeedbackOptions): Promise<Feedback[]> {
    const query: Record<string, string | number | undefined> = {
      page: options.page ?? 1,
      limit: options.limit ?? 25,
      sort: options.sort,
      filter: options.filter,
    };
    return this.request<Feedback[]>("GET", "/feedback", { query });
  }
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS — all prior tests plus 2 new listFeedback tests.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "Add UserbackClient.listFeedback"
```

---

## Task 5: createFeedback()

**Files:**
- Modify: `src/client.ts`
- Modify: `test/client.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/client.test.ts`:

```ts
describe("createFeedback", () => {
  let agent: MockAgent;

  before(() => {
    process.env.USERBACK_API_KEY = TEST_API_KEY;
    process.env.USERBACK_BASE_URL = TEST_BASE_URL;
  });

  beforeEach(() => { agent = installMockAgent(); });
  after(() => { restoreDispatcher(); });

  test("POST /feedback with required body fields", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({
        path: "/1.0/feedback",
        method: "POST",
        body: (raw) => {
          const parsed = JSON.parse(raw);
          assert.equal(parsed.projectId, 7);
          assert.equal(parsed.email, "me@example.com");
          assert.equal(parsed.feedbackType, "Bug");
          assert.equal(parsed.title, "Broken checkout");
          assert.equal(parsed.description, "500 on submit");
          return true;
        },
      })
      .reply(201, { id: 999, title: "Broken checkout" }, {
        headers: { "content-type": "application/json" },
      });

    const client = new UserbackClient();
    const created = await client.createFeedback({
      projectId: 7,
      email: "me@example.com",
      feedbackType: "Bug",
      title: "Broken checkout",
      description: "500 on submit",
    });
    assert.equal(created.id, 999);
  });

  test("POST /feedback propagates 422 as ValidationError", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({ path: "/1.0/feedback", method: "POST" })
      .reply(422, { errors: { title: ["is required"] } }, {
        headers: { "content-type": "application/json" },
      });

    const client = new UserbackClient();
    await assert.rejects(
      () => client.createFeedback({
        projectId: 7,
        email: "me@example.com",
        feedbackType: "General",
        title: "",
        description: "x",
      }),
      { name: "ValidationError" },
    );
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test`
Expected: FAIL — `createFeedback is not a function`.

- [ ] **Step 3: Implement createFeedback**

Add to `UserbackClient`:

```ts
  async createFeedback(attrs: CreateFeedbackAttrs): Promise<Feedback> {
    return this.request<Feedback>("POST", "/feedback", { body: attrs });
  }
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "Add UserbackClient.createFeedback"
```

---

## Task 6: updateFeedback()

**Files:**
- Modify: `src/client.ts`
- Modify: `test/client.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/client.test.ts`:

```ts
describe("updateFeedback", () => {
  let agent: MockAgent;

  before(() => {
    process.env.USERBACK_API_KEY = TEST_API_KEY;
    process.env.USERBACK_BASE_URL = TEST_BASE_URL;
  });

  beforeEach(() => { agent = installMockAgent(); });
  after(() => { restoreDispatcher(); });

  test("PATCH /feedback/:id with Workflow name body", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({
        path: "/1.0/feedback/123",
        method: "PATCH",
        body: (raw) => {
          const parsed = JSON.parse(raw);
          assert.deepEqual(parsed, { Workflow: { name: "Closed" } });
          return true;
        },
      })
      .reply(200, { id: 123 }, {
        headers: { "content-type": "application/json" },
      });

    const client = new UserbackClient();
    const updated = await client.updateFeedback(123, { Workflow: { name: "Closed" } });
    assert.equal(updated.id, 123);
  });

  test("PATCH /feedback/:id with Workflow id body", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({
        path: "/1.0/feedback/123",
        method: "PATCH",
        body: (raw) => {
          const parsed = JSON.parse(raw);
          assert.deepEqual(parsed, { Workflow: { id: 7 } });
          return true;
        },
      })
      .reply(200, { id: 123 });

    const client = new UserbackClient();
    await client.updateFeedback(123, { Workflow: { id: 7 } });
  });

  test("PATCH /feedback/:id propagates 404", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({ path: "/1.0/feedback/999", method: "PATCH" })
      .reply(404, { error: "not found" });

    const client = new UserbackClient();
    await assert.rejects(
      () => client.updateFeedback(999, { Workflow: { name: "Closed" } }),
      { name: "NotFoundError" },
    );
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — `updateFeedback is not a function`.

- [ ] **Step 3: Implement updateFeedback**

Add to `UserbackClient`:

```ts
  async updateFeedback(id: number, attrs: UpdateFeedbackAttrs): Promise<Feedback> {
    return this.request<Feedback>("PATCH", `/feedback/${id}`, { body: attrs });
  }
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "Add UserbackClient.updateFeedback"
```

---

## Task 7: createComment()

**Files:**
- Modify: `src/client.ts`
- Modify: `test/client.test.ts`

- [ ] **Step 1: Write failing test**

Append to `test/client.test.ts`:

```ts
describe("createComment", () => {
  let agent: MockAgent;

  before(() => {
    process.env.USERBACK_API_KEY = TEST_API_KEY;
    process.env.USERBACK_BASE_URL = TEST_BASE_URL;
  });

  beforeEach(() => { agent = installMockAgent(); });
  after(() => { restoreDispatcher(); });

  test("POST /feedback/comment with feedbackId in body (not path)", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({
        path: "/1.0/feedback/comment",
        method: "POST",
        body: (raw) => {
          const parsed = JSON.parse(raw);
          assert.deepEqual(parsed, { feedbackId: 42, comment: "fixed" });
          return true;
        },
      })
      .reply(201, { id: 9001 }, {
        headers: { "content-type": "application/json" },
      });

    const client = new UserbackClient();
    const comment = await client.createComment({ feedbackId: 42, comment: "fixed" });
    assert.equal(comment.id, 9001);
  });

  test("POST /feedback/comment propagates 422", async () => {
    mockPool(agent, TEST_ORIGIN)
      .intercept({ path: "/1.0/feedback/comment", method: "POST" })
      .reply(422, { error: "empty comment" }, {
        headers: { "content-type": "application/json" },
      });

    const client = new UserbackClient();
    await assert.rejects(
      () => client.createComment({ feedbackId: 42, comment: "" }),
      { name: "ValidationError" },
    );
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — `createComment is not a function`.

- [ ] **Step 3: Implement createComment**

Add to `UserbackClient`:

```ts
  async createComment(args: { feedbackId: number; comment: string }): Promise<Comment> {
    return this.request<Comment>("POST", "/feedback/comment", { body: args });
  }
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "Add UserbackClient.createComment"
```

---

## Task 8: Formatter — human and JSON for single feedback

**Files:**
- Create: `src/formatter.ts`
- Create: `test/formatter.test.ts`

- [ ] **Step 1: Write failing tests for feedbackJson and feedbackHuman**

Create `test/formatter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feedbackJson,
  feedbackHuman,
  createdIdHuman,
} from "../src/formatter.js";
import type { Feedback } from "../src/client.js";

const sample: Feedback = {
  id: 42,
  projectId: 7,
  feedbackType: "Bug",
  title: "Checkout broken",
  description: "500 on submit",
  priority: "high",
  category: "billing",
  rating: "3",
  createdAt: "2026-04-10T09:00:00Z",
};

test("feedbackJson returns parseable JSON with trailing newline", () => {
  const out = feedbackJson(sample);
  assert.ok(out.endsWith("\n"));
  const parsed = JSON.parse(out);
  assert.equal(parsed.id, 42);
  assert.equal(parsed.title, "Checkout broken");
});

test("feedbackHuman renders key fields on separate lines", () => {
  const out = feedbackHuman(sample);
  assert.match(out, /id:\s+42/);
  assert.match(out, /type:\s+Bug/);
  assert.match(out, /title:\s+Checkout broken/);
  assert.match(out, /priority:\s+high/);
  assert.match(out, /created:\s+2026-04-10T09:00:00Z/);
});

test("feedbackHuman renders missing fields as em-dash", () => {
  const sparse: Feedback = { id: 1 };
  const out = feedbackHuman(sparse);
  assert.match(out, /id:\s+1/);
  assert.match(out, /type:\s+—/);
  assert.match(out, /title:\s+—/);
});

test("createdIdHuman prints just the id", () => {
  assert.equal(createdIdHuman({ id: 42 }), "42\n");
});
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/formatter.js'`.

- [ ] **Step 3: Implement formatter**

Create `src/formatter.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/formatter.ts test/formatter.test.ts
git commit -m "Add single-feedback formatters (JSON, human, created-id)"
```

---

## Task 9: Formatter — list outputs

**Files:**
- Modify: `src/formatter.ts`
- Modify: `test/formatter.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/formatter.test.ts`:

```ts
import { feedbackListJson, feedbackListHuman } from "../src/formatter.js";

test("feedbackListJson returns parseable JSON array with newline", () => {
  const rows: Feedback[] = [{ id: 1 }, { id: 2 }];
  const out = feedbackListJson(rows);
  assert.ok(out.endsWith("\n"));
  const parsed = JSON.parse(out);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 1);
});

test("feedbackListJson returns [] for empty input", () => {
  const out = feedbackListJson([]);
  assert.equal(out, "[]\n");
});

test("feedbackListHuman has a header row and one row per feedback", () => {
  const rows: Feedback[] = [
    { id: 1, feedbackType: "Bug", title: "first", priority: "high", createdAt: "2026-04-01" },
    { id: 2, feedbackType: "Idea", title: "second", priority: "low", createdAt: "2026-04-02" },
  ];
  const out = feedbackListHuman(rows);
  const lines = out.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /ID/);
  assert.match(lines[0]!, /TYPE/);
  assert.match(lines[0]!, /TITLE/);
  assert.match(lines[1]!, /1/);
  assert.match(lines[1]!, /Bug/);
  assert.match(lines[1]!, /first/);
  assert.match(lines[2]!, /2/);
  assert.match(lines[2]!, /Idea/);
});

test("feedbackListHuman renders 'no feedback found' when empty", () => {
  assert.equal(feedbackListHuman([]), "no feedback found\n");
});

test("feedbackListHuman renders em-dash for missing fields in rows", () => {
  const rows: Feedback[] = [{ id: 1 }];
  const out = feedbackListHuman(rows);
  assert.match(out, /—/);
});
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement list formatters**

Append to `src/formatter.ts`:

```ts
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
    const created = orDash(row.createdAt);
    lines.push(`${id}  ${type}  ${title}  ${priority}  ${created}`);
  }
  return lines.join("\n") + "\n";
}

function orDashPad(value: unknown, width: number): string {
  const s = value === undefined || value === null || value === "" ? DASH : String(value);
  return s.padEnd(width);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/formatter.ts test/formatter.test.ts
git commit -m "Add feedback list formatters (JSON and padded human table)"
```

---

## Task 10: Formatter — error outputs

**Files:**
- Modify: `src/formatter.ts`
- Modify: `test/formatter.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/formatter.test.ts`:

```ts
import { errorHuman, errorJson } from "../src/formatter.js";
import {
  ConfigError,
  NetworkError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ServerError,
  HTTPError,
} from "../src/client.js";

test("errorHuman for ConfigError", () => {
  assert.equal(errorHuman(new ConfigError("missing key")), "ub: config: missing key\n");
});

test("errorHuman for UnauthorizedError", () => {
  const err = new UnauthorizedError(401, null, "unauth");
  assert.equal(errorHuman(err), "ub: unauthorized: unauth\n");
});

test("errorHuman for NotFoundError", () => {
  const err = new NotFoundError(404, null, "missing");
  assert.equal(errorHuman(err), "ub: not_found: missing\n");
});

test("errorHuman for NetworkError", () => {
  assert.equal(errorHuman(new NetworkError("ECONNREFUSED")), "ub: network: ECONNREFUSED\n");
});

test("errorJson for ConfigError has kind=config", () => {
  const out = errorJson(new ConfigError("missing key"));
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed, { error: { kind: "config", message: "missing key" } });
  assert.ok(out.endsWith("\n"));
});

test("errorJson for HTTP error includes status and body", () => {
  const err = new ValidationError(422, { field: "title" }, "validation");
  const parsed = JSON.parse(errorJson(err));
  assert.equal(parsed.error.kind, "validation");
  assert.equal(parsed.error.status, 422);
  assert.deepEqual(parsed.error.body, { field: "title" });
});

test("errorJson for NetworkError has kind=network", () => {
  const parsed = JSON.parse(errorJson(new NetworkError("timeout")));
  assert.equal(parsed.error.kind, "network");
  assert.equal(parsed.error.message, "timeout");
});

test("errorJson for unknown Error falls back to kind=unexpected", () => {
  const err = new Error("boom");
  const parsed = JSON.parse(errorJson(err as UserbackError));
  assert.equal(parsed.error.kind, "unexpected");
  assert.equal(parsed.error.message, "boom");
});
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Replace the top-of-file imports in src/formatter.ts**

The existing import (from Task 8) only pulls `Feedback` as a type. Error
formatting needs the error classes as values (for `instanceof`). Replace
the top of `src/formatter.ts`:

```ts
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
```

(The `orDash`, `feedbackJson`, `feedbackHuman`, `createdIdHuman`,
`feedbackListJson`, `feedbackListHuman`, `orDashPad`, and `truncate`
definitions from Tasks 8 and 9 stay untouched below this import block.)

- [ ] **Step 4: Implement error formatters**

Append to `src/formatter.ts`:

```ts
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

export function errorJson(err: Error): string {
  const kind = kindOf(err);
  const payload: {
    error: {
      kind: string;
      message: string;
      status?: number;
      body?: unknown;
    };
  } = {
    error: { kind, message: err.message },
  };
  if (err instanceof HTTPError) {
    payload.error.status = err.status;
    payload.error.body = err.body;
  }
  return JSON.stringify(payload) + "\n";
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, no typecheck output.

- [ ] **Step 6: Commit**

```bash
git add src/formatter.ts test/formatter.test.ts
git commit -m "Add error formatters (human and JSON) with kind mapping"
```

---

## Task 11: CLI skeleton — run() export, version flag, exit-code translation

**Files:**
- Create: `src/cli.ts`
- Create: `test/cli.test.ts`
- Create: `bin/ub.js`

This task lands the CLI entry points and the top-level try/catch without
any subcommand yet. We verify `ub --version` works end-to-end through
the subprocess test.

- [ ] **Step 1: Create bin/ub.js (plain ESM shebang stub)**

Create `bin/ub.js`:

```js
#!/usr/bin/env node
import("../dist/cli.js").then((m) => m.run(process.argv));
```

- [ ] **Step 2: Make bin/ub.js executable**

Run: `chmod +x bin/ub.js && ls -l bin/ub.js`
Expected: permissions include `x` (e.g., `-rwxr-xr-x`).

- [ ] **Step 3: Write failing test for CLI version**

Create `test/cli.test.ts`:

```ts
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
```

Note: the spawn uses `src/cli-entry.ts` for in-repo testing (TS source, no compile needed) and `bin/ub.js` is only used post-build. We'll create `src/cli-entry.ts` in Step 5.

- [ ] **Step 4: Run test to verify failure**

Run: `npm test`
Expected: FAIL — `src/cli-entry.ts` doesn't exist yet.

- [ ] **Step 5: Create src/cli.ts with run() and Commander program**

Create `src/cli.ts`:

```ts
import { Command } from "commander";
import { createRequire } from "node:module";
import { UserbackError, HTTPError, ConfigError, NetworkError, UnauthorizedError, NotFoundError, ValidationError, ServerError } from "./client.js";
import { errorHuman, errorJson } from "./formatter.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

function buildProgram(): Command {
  const program = new Command();
  program
    .name("ub")
    .description("Userback CLI (userback-cli)")
    .version(pkg.version)
    .showHelpAfterError();

  return program;
}

function exitCodeFor(err: Error): number {
  if (err instanceof ConfigError) return 2;
  if (err instanceof UnauthorizedError) return 3;
  if (err instanceof NotFoundError) return 4;
  if (err instanceof ValidationError) return 5;
  if (err instanceof HTTPError) return 6;
  if (err instanceof NetworkError) return 7;
  return 1;
}

function isJsonModeRequested(argv: string[]): boolean {
  return argv.includes("--json");
}

function reportError(err: Error, argv: string[]): void {
  const jsonMode = isJsonModeRequested(argv);
  if (err instanceof UserbackError) {
    if (jsonMode) {
      process.stdout.write(errorJson(err));
    } else {
      process.stderr.write(errorHuman(err));
    }
    return;
  }
  if (jsonMode) {
    process.stdout.write(errorJson(err));
  } else {
    process.stderr.write(errorHuman(err));
    if (process.env.UB_DEBUG === "1" && err.stack) {
      process.stderr.write(err.stack + "\n");
    }
  }
}

export async function run(argv: string[]): Promise<never> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
    process.exit(0);
  } catch (caught) {
    const err = caught instanceof Error ? caught : new Error(String(caught));
    reportError(err, argv);
    process.exit(exitCodeFor(err));
  }
}
```

- [ ] **Step 6: Create src/cli-entry.ts for tsx-based test entry**

Create `src/cli-entry.ts`:

```ts
import { run } from "./cli.js";
run(process.argv);
```

- [ ] **Step 7: Adjust tsconfig to include cli-entry.ts**

No change needed — `src/**/*.ts` already covers it.

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: PASS — `ub --version` prints `0.1.0`.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add src/cli.ts src/cli-entry.ts bin/ub.js test/cli.test.ts
git commit -m "Add CLI entry point with Commander program, version flag, exit-code mapping"
```

---

## Task 12: `ub show` subcommand

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Add CLI test helper for subprocess-friendly HTTP stubbing**

Append to `test/cli.test.ts`:

```ts
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
```

- [ ] **Step 2: Write failing test for `ub show`**

Append to `test/cli.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test**

Run: `npm test`
Expected: FAIL — `unknown command 'show'`.

- [ ] **Step 4: Implement `show` in src/cli.ts**

Add to `src/cli.ts` inside `buildProgram()`, before `return program;`:

```ts
  program
    .command("show <feedbackId>")
    .description("Show a single feedback item")
    .option("--json", "Emit JSON instead of a human-readable block")
    .action(async (feedbackIdRaw: string, opts: { json?: boolean }) => {
      const id = parsePositiveInt(feedbackIdRaw, "feedbackId");
      const { UserbackClient } = await import("./client.js");
      const { feedbackHuman, feedbackJson } = await import("./formatter.js");
      const client = new UserbackClient();
      const row = await client.getFeedback(id);
      process.stdout.write(opts.json ? feedbackJson(row) : feedbackHuman(row));
    });
```

Add a helper to the top of `src/cli.ts` (after imports, before `buildProgram`):

```ts
function parsePositiveInt(raw: string, name: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  return n;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "Add ub show subcommand with human/JSON modes and id validation"
```

---

## Task 13: `ub list` subcommand

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/cli.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — `unknown command 'list'`.

- [ ] **Step 3: Implement `list` in src/cli.ts**

Add to `buildProgram()`:

```ts
  program
    .command("list")
    .description("List feedback items (one page per invocation)")
    .option("--json", "Emit JSON instead of a human-readable table")
    .option("--limit <n>", "Page size (max 50)", "25")
    .option("--status <name>", "Filter by workflow stage name")
    .option("--project-id <id>", "Filter by project id")
    .option("--type <type>", "Filter by feedback type (General|Bug|Idea)")
    .action(async (opts: {
      json?: boolean;
      limit: string;
      status?: string;
      projectId?: string;
      type?: string;
    }) => {
      const requested = parsePositiveInt(opts.limit, "--limit");
      let limit = requested;
      if (limit > 50) {
        limit = 50;
        if (!opts.json) {
          process.stderr.write("ub: --limit clamped to API max of 50\n");
        }
      }

      const filters: string[] = [];
      if (opts.projectId) {
        const pid = parsePositiveInt(opts.projectId, "--project-id");
        filters.push(`projectId eq ${pid}`);
      }
      if (opts.type) {
        validateFeedbackType(opts.type);
        filters.push(`feedbackType eq '${opts.type}'`);
      }
      if (opts.status) {
        filters.push(`Workflow/name eq '${escapeODataString(opts.status)}'`);
      }
      const filter = filters.length > 0 ? filters.join(" and ") : undefined;

      const { UserbackClient } = await import("./client.js");
      const { feedbackListHuman, feedbackListJson } = await import("./formatter.js");
      const client = new UserbackClient();
      const rows = await client.listFeedback({ limit, filter });
      process.stdout.write(opts.json ? feedbackListJson(rows) : feedbackListHuman(rows));
    });
```

Add supporting helpers (at top of `src/cli.ts`, next to `parsePositiveInt`):

```ts
const FEEDBACK_TYPES = new Set(["General", "Bug", "Idea"]);

function validateFeedbackType(t: string): void {
  if (!FEEDBACK_TYPES.has(t)) {
    throw new ConfigError(`--type must be one of General|Bug|Idea, got: ${t}`);
  }
}

function escapeODataString(s: string): string {
  return s.replaceAll("'", "''");
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "Add ub list subcommand with filters, limit clamping, JSON mode"
```

---

## Task 14: `ub create` subcommand

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/cli.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — `unknown command 'create'`.

- [ ] **Step 3: Implement `create` in src/cli.ts**

Add to `buildProgram()`:

```ts
  program
    .command("create")
    .description("Create a new feedback item")
    .requiredOption("--title <title>", "Feedback title")
    .requiredOption("--body <body>", "Feedback description")
    .option("--type <type>", "General|Bug|Idea", "General")
    .option("--project-id <id>", "Overrides USERBACK_DEFAULT_PROJECT_ID")
    .option("--priority <priority>", "low|neutral|high|urgent")
    .option("--email <email>", "Overrides USERBACK_DEFAULT_EMAIL")
    .option("--json", "Emit JSON instead of printing just the new id")
    .action(async (opts: {
      title: string;
      body: string;
      type: string;
      projectId?: string;
      priority?: string;
      email?: string;
      json?: boolean;
    }) => {
      validateFeedbackType(opts.type);
      const projectIdRaw = opts.projectId ?? process.env.USERBACK_DEFAULT_PROJECT_ID;
      if (!projectIdRaw) {
        throw new ConfigError("--project-id or USERBACK_DEFAULT_PROJECT_ID is required");
      }
      const projectId = parsePositiveInt(projectIdRaw, "project-id");
      const email = opts.email ?? process.env.USERBACK_DEFAULT_EMAIL;
      if (!email) {
        throw new ConfigError("--email or USERBACK_DEFAULT_EMAIL is required");
      }
      if (opts.priority !== undefined) {
        validatePriority(opts.priority);
      }

      const { UserbackClient } = await import("./client.js");
      const { feedbackJson, createdIdHuman } = await import("./formatter.js");
      const client = new UserbackClient();
      const created = await client.createFeedback({
        projectId,
        email,
        feedbackType: opts.type as "General" | "Bug" | "Idea",
        title: opts.title,
        description: opts.body,
        priority: opts.priority as "low" | "neutral" | "high" | "urgent" | undefined,
      });
      process.stdout.write(opts.json ? feedbackJson(created) : createdIdHuman(created));
    });
```

Add helper near `validateFeedbackType`:

```ts
const PRIORITIES = new Set(["low", "neutral", "high", "urgent"]);

function validatePriority(p: string): void {
  if (!PRIORITIES.has(p)) {
    throw new ConfigError(`--priority must be one of low|neutral|high|urgent, got: ${p}`);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "Add ub create subcommand with required flags, env overrides, type/priority validation"
```

---

## Task 15: `ub close` subcommand

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/cli.test.ts`:

```ts
describe("ub close", () => {
  let server: TestServer;

  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  test("PATCH with Workflow.name='Closed' by default", async () => {
    server.setHandler(async (req, res) => {
      assert.equal(req.method, "PATCH");
      assert.equal(req.url, "/1.0/feedback/42");
      const body = JSON.parse(await collectBody(req));
      assert.deepEqual(body, { Workflow: { name: "Closed" } });
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
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — `unknown command 'close'`.

- [ ] **Step 3: Implement `close` in src/cli.ts**

Add to `buildProgram()`:

```ts
  program
    .command("close <feedbackId>")
    .description("Close a feedback item by advancing its workflow stage")
    .option("--comment <text>", "Post a comment after closing")
    .option("--json", "Emit JSON output")
    .action(async (feedbackIdRaw: string, opts: { comment?: string; json?: boolean }) => {
      const id = parsePositiveInt(feedbackIdRaw, "feedbackId");
      const workflow = buildCloseWorkflow();

      const { UserbackClient } = await import("./client.js");
      const { errorJson } = await import("./formatter.js");
      const client = new UserbackClient();

      await client.updateFeedback(id, { Workflow: workflow });

      if (opts.comment !== undefined) {
        try {
          await client.createComment({ feedbackId: id, comment: opts.comment });
        } catch (commentErr) {
          const err = commentErr instanceof Error ? commentErr : new Error(String(commentErr));
          if (opts.json) {
            const body = { closed: true, comment: JSON.parse(errorJson(err)) };
            process.stdout.write(JSON.stringify(body) + "\n");
          } else {
            process.stderr.write(`ub: closed ${id} but failed to post comment\n`);
            process.stderr.write(`ub: ${err.message}\n`);
          }
          process.exit(6);
        }
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify({ closed: true, id }) + "\n");
      } else {
        process.stdout.write(`closed ${id}\n`);
      }
    });
```

Add the workflow helper near `parsePositiveInt`:

```ts
function buildCloseWorkflow(): { id: number } | { name: string } {
  const raw = process.env.USERBACK_CLOSED_STATUS;
  if (raw !== undefined && /^\d+$/.test(raw)) {
    return { id: Number(raw) };
  }
  return { name: raw ?? "Closed" };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "Add ub close subcommand with workflow stage PATCH and optional comment"
```

---

## Task 16: `ub comment` subcommand

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `test/cli.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — `unknown command 'comment'`.

- [ ] **Step 3: Implement `comment` in src/cli.ts**

Add to `buildProgram()`:

```ts
  program
    .command("comment <feedbackId>")
    .description("Add a comment to a feedback item")
    .requiredOption("--body <text>", "Comment body")
    .option("--json", "Emit JSON instead of the new comment id")
    .action(async (feedbackIdRaw: string, opts: { body: string; json?: boolean }) => {
      const id = parsePositiveInt(feedbackIdRaw, "feedbackId");
      const { UserbackClient } = await import("./client.js");
      const client = new UserbackClient();
      const created = await client.createComment({ feedbackId: id, comment: opts.body });
      if (opts.json) {
        process.stdout.write(JSON.stringify(created) + "\n");
      } else {
        process.stdout.write(`${created.id}\n`);
      }
    });
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS. Commander exits non-zero (likely 1) on missing required option and writes to stderr — that's acceptable and matches the Commander built-in behavior.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "Add ub comment subcommand"
```

---

## Task 17: Verify build artifact and end-to-end bin/ub.js flow

**Files:**
- Modify: `test/cli.test.ts` (add build-artifact test)

This task verifies the publish path: `tsc` produces `dist/`, `bin/ub.js`
dynamic-imports it, and the binary runs under plain `node` (no tsx).

- [ ] **Step 1: Build the project**

Run: `npm run build && ls dist/`
Expected: `dist/cli.js`, `dist/cli-entry.js`, `dist/client.js`, `dist/formatter.js`, and matching `.d.ts` files.

- [ ] **Step 2: Run the built binary manually**

Run: `./bin/ub.js --version`
Expected: `0.1.0` on stdout, exit 0.

- [ ] **Step 3: Write build-artifact smoke test**

Append to `test/cli.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS on all suites (error hierarchy, client, formatter, CLI, build artifact). If the `bin/ub.js` test fails with "cannot find dist/cli.js", re-run `npm run build` — the test assumes the artifact exists from Step 1.

- [ ] **Step 5: Commit**

```bash
git add test/cli.test.ts
git commit -m "Add post-build smoke test running bin/ub.js under plain node"
```

---

## Task 18: README, LICENSE, and polish

**Files:**
- Create: `README.md`
- Create: `LICENSE`

- [ ] **Step 1: Create LICENSE (MIT)**

Create `LICENSE`:

```
MIT License

Copyright (c) 2026 Jim @ Flagrant

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Create README.md**

Create `README.md`:

````markdown
# userback-cli

Command-line tool for the [Userback](https://userback.io) REST API.

Install as `userback-cli`; invoke as `ub`. Designed to be called by
LLM agents in shell pipelines: every command supports `--json` for
structured output, and exit codes are stable per class of failure.

## Install

```sh
npm install -g userback-cli
ub --help
```

Requires Node.js 24 or later.

## Configuration

Set these environment variables:

| Var | Required | Purpose |
|---|---|---|
| `USERBACK_API_KEY` | Yes | Bearer token from Workspace Settings → API Tokens. |
| `USERBACK_BASE_URL` | No | Override the API base URL. Defaults to `https://rest.userback.io/1.0`. |
| `USERBACK_DEFAULT_PROJECT_ID` | Required for `ub create` unless `--project-id` is passed | Numeric project id. |
| `USERBACK_DEFAULT_EMAIL` | Required for `ub create` unless `--email` is passed | Submitter email. |
| `USERBACK_CLOSED_STATUS` | No | Workflow stage name for `ub close`. Defaults to `"Closed"`. See below. |
| `UB_DEBUG` | No | Set to `1` to include stack traces on unexpected errors. |

## Commands

```sh
ub list [--json] [--limit N] [--type Bug|Idea|General] [--project-id ID] [--status NAME]
ub show <id> [--json]
ub create --title "..." --body "..." [--type ...] [--priority ...] [--project-id ID] [--email E] [--json]
ub close <id> [--comment "..."] [--json]
ub comment <id> --body "..." [--json]
```

## Examples

List the 10 most recent Bug-type feedback items, pretty-printed:

```sh
ub list --type Bug --limit 10
```

Fetch everything in JSON and pipe to `jq`:

```sh
ub list --json | jq '.[] | {id, title, priority}'
```

File a new bug:

```sh
ub create --title "Bug in checkout" --body "500 on submit"
```

View a single feedback item:

```sh
ub show 123
```

Close a feedback item with a note:

```sh
ub close 123 --comment "Fixed in deploy 2026-04-18"
```

Add a comment without closing:

```sh
ub comment 123 --body "Reproduced on Safari"
```

## How `close` works

The Userback API has no plain "status" field. Closing a feedback item
means PATCHing its `Workflow` to a named stage. By default, `ub close`
sends `{ "Workflow": { "name": "Closed" } }`. Override the name with
`USERBACK_CLOSED_STATUS`, or set it to a numeric id to target a stage
by id instead of name:

```sh
export USERBACK_CLOSED_STATUS="Will Not Do"   # by name
export USERBACK_CLOSED_STATUS="9"             # by id
```

If your workspace uses a different terminal stage label, configure it
once and every subsequent `ub close` uses it.

See [ADR 0001](docs/adr/0001-close-via-workflow-stage.md) for the full
rationale.

## Output contract

- **Human mode (default):** success → stdout, errors → stderr.
- **JSON mode (`--json`):** success *and* errors → stdout as JSON. This
  lets `ub list --json | jq` handle failures without special-casing
  stderr. The exit code tells you whether to parse as success or as
  an error envelope.
- **Exit codes:** 0 success, 2 config, 3 unauthorized, 4 not found,
  5 validation, 6 other HTTP error, 7 network, 1 unexpected.

## Assumptions requiring verification

This MVP ships with a handful of API details inferred from incomplete
documentation. If you hit surprising behavior, these are the likely
causes:

- **Feedback response shape** — the human formatter renders `—` for
  any field the API omits, so unexpected fields don't break display.
- **Workflow stage by name** — `PATCH` accepts `Workflow.name`. If
  your workspace rejects it, set `USERBACK_CLOSED_STATUS` to the
  stage's numeric id.
- **OData filter syntax** — `list --type` and `--project-id` compose
  `eq` expressions with single-quoted strings. Adjust if the API
  returns 422 on filters.
- **429 / rate limits** — MVP does not retry; 429 exits 6.
- **Comment visibility** — `isPublic` is unset, so the API default
  applies.

Full design notes live in
[`docs/superpowers/specs/2026-04-18-userback-cli-mvp-design.md`](docs/superpowers/specs/2026-04-18-userback-cli-mvp-design.md).

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
./bin/ub.js --help
```

## Decisions

See [`docs/adr/`](docs/adr/) for decision records covering the stack
choice, output contract, packaging, and the close-via-workflow
mechanism.

## License

MIT. See [LICENSE](LICENSE).
````

- [ ] **Step 3: Run the full test suite one more time**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 4: Verify `npm pack --dry-run` ships only what it should**

Run: `npm pack --dry-run 2>&1 | grep -E '^npm notice '`
Expected: the file list includes `dist/`, `bin/`, `README.md`,
`LICENSE`, `package.json` — and does NOT include `src/`, `test/`,
`tsconfig.json`, `.gitignore`, or `docs/`.

- [ ] **Step 5: Commit**

```bash
git add README.md LICENSE
git commit -m "Add README with install/usage/examples and MIT LICENSE"
```

---

## Done

At this point:
- `npm test` passes (~35 tests across 3 suites: client, formatter, CLI).
- `npm run typecheck` is clean.
- `npm run build` produces `dist/` with types.
- `./bin/ub.js --version` works under plain Node 24.
- `npm pack --dry-run` ships only the intended files.
- Repo is on `main` with one commit per task plus the pre-existing
  docs commit.

To publish (out of scope for this plan, but one-liner):

```sh
npm login
npm publish --access public
```
