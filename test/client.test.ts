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

describe("createFeedback", () => {
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
