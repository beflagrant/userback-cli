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
