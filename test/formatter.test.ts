import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feedbackJson,
  feedbackHuman,
  createdIdHuman,
} from "../src/formatter.js";
import type { Feedback } from "../src/client.js";
import {
  ConfigError,
  NetworkError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ServerError,
  HTTPError,
  UserbackError,
} from "../src/client.js";

const sample: Feedback = {
  id: 42,
  projectId: 7,
  feedbackType: "Bug",
  title: "Checkout broken",
  description: "500 on submit",
  priority: "high",
  category: "billing",
  rating: "3",
  created: "2026-04-10T09:00:00Z",
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
    { id: 1, feedbackType: "Bug", title: "first", priority: "high", created: "2026-04-01" },
    { id: 2, feedbackType: "Idea", title: "second", priority: "low", created: "2026-04-02" },
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

import { errorHuman, errorJson } from "../src/formatter.js";

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

import {
  projectJson,
  projectHuman,
  projectListJson,
  projectListHuman,
} from "../src/formatter.js";
import type { Project } from "../src/client.js";

const sampleProject: Project = {
  id: 139657,
  name: "My first project",
  projectType: "feedback",
  isArchived: false,
  created: "2026-04-18T17:01:38.000Z",
  createdBy: 106367,
  Members: [
    { id: 1, name: "Jim", email: "jim@example.com", role: "Admin" },
  ],
};

test("projectJson returns parseable JSON with trailing newline", () => {
  const out = projectJson(sampleProject);
  assert.ok(out.endsWith("\n"));
  const parsed = JSON.parse(out);
  assert.equal(parsed.id, 139657);
});

test("projectHuman renders scalar fields and member rows", () => {
  const out = projectHuman(sampleProject);
  assert.match(out, /id:\s+139657/);
  assert.match(out, /name:\s+My first project/);
  assert.match(out, /type:\s+feedback/);
  assert.match(out, /archived:\s+false/);
  assert.match(out, /members:/);
  assert.match(out, /Jim <jim@example\.com> \(Admin\)/);
});

test("projectHuman omits members block when Members is empty", () => {
  const out = projectHuman({ id: 1, name: "P", Members: [] });
  assert.doesNotMatch(out, /members:/);
});

test("projectHuman renders em-dash for missing fields", () => {
  const out = projectHuman({ id: 1 });
  assert.match(out, /name:\s+—/);
  assert.match(out, /archived:\s+—/);
});

test("projectListJson returns parseable JSON array with newline", () => {
  const out = projectListJson([{ id: 1 }, { id: 2 }]);
  assert.ok(out.endsWith("\n"));
  assert.equal(JSON.parse(out).length, 2);
});

test("projectListJson returns [] for empty input", () => {
  assert.equal(projectListJson([]), "[]\n");
});

test("projectListHuman renders header and one row per project", () => {
  const rows: Project[] = [
    { id: 1, name: "first", projectType: "feedback", isArchived: false },
    { id: 2, name: "second", projectType: "bug", isArchived: true },
  ];
  const out = projectListHuman(rows);
  const lines = out.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /ID/);
  assert.match(lines[0]!, /NAME/);
  assert.match(lines[0]!, /ARCHIVED/);
  assert.match(lines[1]!, /first/);
  assert.match(lines[2]!, /second/);
  assert.match(lines[2]!, /true/);
});

test("projectListHuman renders 'no projects found' when empty", () => {
  assert.equal(projectListHuman([]), "no projects found\n");
});
